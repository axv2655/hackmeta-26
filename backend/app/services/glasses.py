"""Glasses: a spoken "start a Move" becomes a draft; nothing posts until confirm
(ARCHITECTURE.md 14.2, PROMPTS.md S9).

Flow: `command` parses the utterance (Muse, with a local fallback), looks up the
nearest Mark, composes a draft and holds it in memory. `confirm` posts it once
through `MoveGateway.create(origin="glasses")`.

Pending drafts live in a process-local store, one per user, with a five minute
TTL measured by the `Clock` port. A restart or expiry loses the draft; confirm
then answers 409 "say it again" and never posts. No table backs this.

Coordinates are used for the nearest-Mark lookup only. They are never stored,
logged or echoed, and are not passed on to Muse. Without them the draft has no
place of its own (we never fall back to stored GPS).
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import uuid
from collections import Counter
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Literal, Protocol

from app.container import Container
from app.ports import (
    Category,
    Clock,
    Intent,
    MarkGateway,
    MarkSnapshot,
    MoveCreate,
    MoveDraftOut,
    MoveGateway,
    MuseGateway,
)

logger = logging.getLogger(__name__)

DRAFT_TTL = timedelta(minutes=5)
MAX_UTTERANCE = 500
MAX_TEXT = 140
MAX_SPOKEN_TEXT = 80
FALLBACK_CATEGORY: Category = "other"

_START = re.compile(r"\bstart\s+a\s+move\b[\s,.:;!-]*(.*)$", re.IGNORECASE | re.DOTALL)
_WAKE = re.compile(r"^\s*(?:hey|ok|okay)\s+meta\b[\s,.!]*", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f<>`]+")
_SPACE = re.compile(r"\s+")

SAY_AGAIN = "That Move expired. Say it again."
NO_START = "I can only start a Move. Try saying: start a Move, getting boba."
WHERE_AT = "Where at? Say it again with a place."
MIN_TOKEN = 4
NEAR_M = 200.0  # a Mark farther than this from the caller is not "here"
MAX_NEW_NAME = 60
PHONE_RADIUS_M = 2000.0  # the phone's nearest Mark must be within 2 km
FUZZY_CUTOFF = 0.8
FUZZY_MARGIN = 0.05
COARSE_DECIMALS = 3  # ~100 m, the same rounding the app sends


class GlassesError(Exception):
    """Base of the glasses errors. This lane may not import core's domain error
    kinds, so the route maps these to statuses itself."""


class PlaceFailed(GlassesError):
    """The new spot could not be saved, so nothing was posted."""

    def __init__(self) -> None:
        super().__init__("Couldn't save that spot. Try again.")


class DraftExpired(GlassesError):
    """No pending draft for this user (never made, expired, or process restarted)."""

    def __init__(self) -> None:
        super().__init__(SAY_AGAIN)  # route: 409


def clean(text: str, limit: int) -> str:
    """Untrusted speech to a safe single line: no control chars or markup
    brackets, collapsed whitespace, cut at `limit` characters."""
    flat = _SPACE.sub(" ", _CONTROL.sub(" ", text)).strip()
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


def fallback_intent(utterance: str) -> Intent:
    """Muse-down parser: `start a move <text>`, case-insensitive."""
    said = _WAKE.sub("", utterance)
    found = _START.search(said)
    if found is None:
        return Intent(intent="none", text=clean(utterance, MAX_TEXT))
    text = clean(found.group(1), MAX_TEXT)
    return Intent(intent="start_move", text=text)


PlaceSource = Literal["nearby", "muse", "named", "usual", "demo", "new", "phone"]


class PlaceFinder(Protocol):
    """Where a Move goes when coordinates and Muse gave no place. Implemented
    over core's tables by `repositories.glasses_places.SqlPlaceFinder`; read-only."""

    def named_in(self, text: str) -> MarkSnapshot | None:
        """A Mark whose name the utterance mentions (unambiguous), else None."""

    def usual_for(self, user_id: str) -> MarkSnapshot | None:
        """The user's most-visited Mark (latest visit breaks ties), else their
        most recently saved one."""

    def demo_mark(self) -> MarkSnapshot | None:
        """The configured demo Mark (Kumo), if it exists."""


class NoPlaces:
    def named_in(self, text: str) -> MarkSnapshot | None:
        return None

    def usual_for(self, user_id: str) -> MarkSnapshot | None:
        return None

    def demo_mark(self) -> MarkSnapshot | None:
        return None


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


@dataclass(frozen=True, slots=True)
class NewPlace:
    """A Mark to create at confirm time for an event with no Mark on the map.
    Coordinates are rounded to ~100 m before they are held."""

    name: str
    category: Category
    lat: float
    lng: float


class PlaceCreator(Protocol):
    """Creates a user Mark. Core owns Marks and exposes no port for this, so the
    adapter calls core's own validated `MarkService.create`."""

    def create(self, user_id: str, place: NewPlace) -> MarkSnapshot: ...


def _words(text: str) -> str:
    return " " + " ".join(re.findall(r"[a-z0-9]+", text.lower())) + " "


def _match_exact(text: str, marks: list[tuple[str, str]]) -> tuple[str | None, bool]:
    """(id, ambiguous): a full name wins (longest first), else a distinctive
    first word. Several equal candidates are ambiguous, not a match."""
    spoken = _words(text)
    full: list[tuple[int, str]] = []
    heads: set[str] = set()
    for mark_id, name in marks:
        name_words = _words(name).strip()
        if not name_words:
            continue
        if f" {name_words} " in spoken:
            full.append((len(name_words), mark_id))
            continue
        head = name_words.split(" ")[0]
        if len(head) >= MIN_TOKEN and f" {head} " in spoken:
            heads.add(mark_id)
    if full:
        top = max(length for length, _ in full)
        best = {mark_id for length, mark_id in full if length == top}
        return (next(iter(best)), False) if len(best) == 1 else (None, True)
    if heads:
        return (next(iter(heads)), False) if len(heads) == 1 else (None, True)
    return None, False


def _match_fuzzy(text: str, marks: list[tuple[str, str]]) -> str | None:
    """A venue the user named, tolerating a typo ("kumoo" for "Kumo Matcha"):
    the closest Mark name or first word, only if clearly the best."""
    query = _words(text).strip()
    if len(query) < MIN_TOKEN:
        return None
    scored: list[tuple[float, str]] = []
    for mark_id, name in marks:
        full = _words(name).strip()
        if not full:
            continue
        head = full.split(" ")[0]
        ratio = SequenceMatcher(None, query, full).ratio()
        if len(head) >= MIN_TOKEN:
            ratio = max(ratio, SequenceMatcher(None, query, head).ratio())
        scored.append((ratio, mark_id))
    scored.sort(reverse=True)
    if not scored or scored[0][0] < FUZZY_CUTOFF:
        return None
    if len(scored) > 1 and scored[0][0] - scored[1][0] < FUZZY_MARGIN:
        return None
    return scored[0][1]


def match_named(
    text: str, marks: Iterable[tuple[str, str]], *, fuzzy: bool = False
) -> str | None:
    """Id of the Mark the text names, or None. Anything ambiguous returns None
    so we ask instead of guessing. `fuzzy` also forgives a typo, for a venue the
    user named on purpose (the MCP `place` argument), never for free text."""
    rows = list(marks)
    found, ambiguous = _match_exact(text, rows)
    if found is not None or ambiguous or not fuzzy:
        return found
    return _match_fuzzy(text, rows)


def usual_mark_id(
    visits: Iterable[tuple[str, datetime]], saved: Iterable[tuple[str, datetime]]
) -> str | None:
    """Most-visited Mark, latest visit breaking ties; else the latest saved."""
    seen = list(visits)
    if seen:
        counts = Counter(mark_id for mark_id, _ in seen)
        latest: dict[str, datetime] = {}
        for mark_id, when in seen:
            latest[mark_id] = max(when, latest.get(mark_id, when))
        return max(counts, key=lambda m: (counts[m], latest[m], m))
    kept = sorted(saved, key=lambda row: (row[1], row[0]), reverse=True)
    return kept[0][0] if kept else None


@dataclass(frozen=True, slots=True)
class Pending:
    id: str
    user_id: str
    draft: MoveDraftOut
    expires_at: datetime
    move_id: str | None = None
    new_place: NewPlace | None = None


class DraftStore:
    """One pending draft per user; TTL measured by the injected clock."""

    def __init__(self, now: Callable[[], datetime], ttl: timedelta = DRAFT_TTL) -> None:
        self._now = now
        self._ttl = ttl
        self._items: dict[str, Pending] = {}

    def put(
        self, user_id: str, draft: MoveDraftOut, new_place: NewPlace | None = None
    ) -> Pending:
        self.purge()  # no scheduler job: sweep expired drafts as new ones arrive
        pending = Pending(
            uuid.uuid4().hex, user_id, draft, self._now() + self._ttl, None, new_place
        )
        self._items[user_id] = pending
        return pending

    def get(self, user_id: str) -> Pending | None:
        pending = self._items.get(user_id)
        if pending is None:
            return None
        if self._now() >= pending.expires_at:
            del self._items[user_id]
            return None
        return pending

    def mark_posted(self, user_id: str, move_id: str) -> Pending | None:
        pending = self._items.get(user_id)
        if pending is None:
            return None
        updated = replace(pending, move_id=move_id)
        self._items[user_id] = updated
        return updated

    def set_mark(self, user_id: str, mark_id: str) -> Pending | None:
        """The pending new place became a real Mark: pin the draft to it."""
        pending = self._items.get(user_id)
        if pending is None:
            return None
        updated = replace(
            pending, draft=replace(pending.draft, mark_id=mark_id), new_place=None
        )
        self._items[user_id] = updated
        return updated

    def purge(self) -> int:
        now = self._now()
        stale = [u for u, p in self._items.items() if now >= p.expires_at]
        for user_id in stale:
            del self._items[user_id]
        return len(stale)

    def __len__(self) -> int:
        return len(self._items)


@dataclass(frozen=True, slots=True)
class CommandResult:
    understood: bool
    spoken: str
    draft_id: str | None = None
    text: str | None = None
    category: Category | None = None
    place: str | None = None
    place_source: PlaceSource | None = None
    needs_place: bool = False
    new_place: bool = False
    expires_at: datetime | None = None
    draft: MoveDraftOut | None = None  # for in-process callers; routes never echo it


@dataclass(frozen=True, slots=True)
class ConfirmResult:
    move_id: str
    text: str
    spoken: str


class GlassesService:
    def __init__(
        self,
        *,
        clock: Clock,
        muse: MuseGateway,
        marks: MarkGateway,
        moves: MoveGateway,
        drafts: DraftStore,
        lock: asyncio.Lock,
        places: PlaceFinder | None = None,
        demo_mode: Callable[[], bool] = lambda: False,
        creator: PlaceCreator | None = None,
        phone_point: Callable[[str], tuple[float, float] | None] | None = None,
    ) -> None:
        self._clock = clock
        self._muse = muse
        self._marks = marks
        self._moves = moves
        self._drafts = drafts
        self._lock = lock
        self._places = places or NoPlaces()
        self._demo_mode = demo_mode
        self._creator = creator
        self._phone_point = phone_point

    async def command(
        self,
        user_id: str,
        utterance: str,
        lat: float | None = None,
        lng: float | None = None,
    ) -> CommandResult:
        """Turn speech into a pending draft. Creates no Move."""
        heard = clean(utterance, MAX_UTTERANCE)
        intent = await self._parse(heard)
        if intent.intent != "start_move" or not intent.text:
            return CommandResult(understood=False, spoken=NO_START)

        return await self.draft_from_text(user_id, intent.text, lat, lng)

    async def draft_from_text(
        self,
        user_id: str,
        text: str,
        lat: float | None = None,
        lng: float | None = None,
        *,
        place: MarkSnapshot | None = None,
        new_place_name: str | None = None,
        user_ids: tuple[str, ...] = (),
        trust_muse: bool = True,
    ) -> CommandResult:
        """Hold a pending draft for already-understood Move text (no intent
        parsing). `place` is an explicit Mark and wins over coordinates;
        `user_ids` replaces Muse's audience picks. With coordinates and no Mark
        within NEAR_M (or a `new_place_name` no Mark has), the draft is for a new
        spot that is only created when confirmed. Creates no Move and no Mark.

        `trust_muse=False` is for callers that run in someone else's cloud (the
        MCP connector): their coordinates and Muse's own place pick are ignored,
        and the place comes only from `place`, a Mark named in the text, the
        user's usual Mark, or the demo Mark in DEMO_MODE."""
        text = clean(text, MAX_TEXT)
        fixed: tuple[MarkSnapshot, PlaceSource] | None = None
        if not trust_muse:
            lat = lng = None
            new_place_name = None
            if place is None:
                fixed = self._fallback(user_id, text)
        nearest = None if place else self._nearest(lat, lng)
        here = self._new_spot_here(place, nearest, lat, lng, new_place_name)
        if here:
            nearest = None
        pinned = place or (fixed[0] if fixed else nearest)
        draft = await self._compose(user_id, text, pinned.id if pinned else None)
        if not trust_muse and place is None:
            draft = replace(draft, mark_id=fixed[0].id if fixed else None)
        if user_ids:
            draft = replace(draft, user_ids=user_ids, circle_ids=())
        if here and lat is not None and lng is not None:
            return self._hold_new_spot(user_id, draft, new_place_name, lat, lng)
        draft, mark, source = self._place(user_id, draft, pinned)
        if place is not None and mark is not None and source == "nearby":
            source = "named"
        if fixed is not None and mark is not None:
            source = fixed[1]
        if mark is None:
            # Nowhere to post: hold no draft, ask. Confirm then answers 409.
            return CommandResult(
                understood=True,
                spoken=f"{clean(draft.text, MAX_SPOKEN_TEXT)}. {WHERE_AT}",
                text=draft.text,
                category=draft.category,
                needs_place=True,
                draft=draft,
            )
        pending = self._drafts.put(user_id, draft)
        return CommandResult(
            understood=True,
            spoken=self._spoken(draft.text, mark, source),
            draft_id=pending.id,
            text=draft.text,
            category=draft.category,
            place=mark.name,
            place_source=source,
            expires_at=pending.expires_at,
            draft=draft,
        )

    def _new_spot_here(
        self,
        place: MarkSnapshot | None,
        nearest: MarkSnapshot | None,
        lat: float | None,
        lng: float | None,
        new_place_name: str | None,
    ) -> bool:
        if self._creator is None or place is not None:
            return False
        if lat is None or lng is None:
            return False
        if new_place_name or nearest is None:
            return True
        return distance_m(lat, lng, nearest.lat, nearest.lng) > NEAR_M

    def _hold_new_spot(
        self,
        user_id: str,
        draft: MoveDraftOut,
        name: str | None,
        lat: float,
        lng: float,
    ) -> CommandResult:
        spot = NewPlace(
            name=clean(name or draft.text, MAX_NEW_NAME) or "New spot",
            category=draft.category,
            lat=round(lat, COARSE_DECIMALS),
            lng=round(lng, COARSE_DECIMALS),
        )
        draft = replace(draft, mark_id=None)
        pending = self._drafts.put(user_id, draft, spot)
        said = clean(draft.text, MAX_SPOKEN_TEXT)
        return CommandResult(
            understood=True,
            spoken=f"{said} at {clean(spot.name, MAX_SPOKEN_TEXT)}, a new spot "
            "here. Say confirm to post.",
            draft_id=pending.id,
            text=draft.text,
            category=draft.category,
            place=spot.name,
            place_source="new",
            new_place=True,
            expires_at=pending.expires_at,
            draft=draft,
        )

    async def confirm(self, user_id: str, draft_id: str | None = None) -> ConfirmResult:
        """Post the pending draft exactly once. A repeat returns the same Move."""
        async with self._lock:
            pending = self._drafts.get(user_id)
            if pending is None or (draft_id and draft_id != pending.id):
                raise DraftExpired
            if pending.move_id is not None:
                return self._result(pending.move_id, pending.draft)
            draft = self._with_real_mark(user_id, pending)
            move = await self._moves.create(user_id, self._to_create(draft))
            self._drafts.mark_posted(user_id, move.id)
        await self._announce(move.id)
        return self._result(move.id, draft)

    def _with_real_mark(self, user_id: str, pending: Pending) -> MoveDraftOut:
        """Create the pending new spot as a Mark (once), then pin the draft."""
        if pending.new_place is None:
            return pending.draft
        if self._creator is None:
            raise PlaceFailed
        try:
            made = self._creator.create(user_id, pending.new_place)
        except Exception:
            logger.warning("glasses: could not create the new spot")
            raise PlaceFailed from None
        updated = self._drafts.set_mark(user_id, made.id)
        return updated.draft if updated else replace(pending.draft, mark_id=made.id)

    # -- steps ----------------------------------------------------------

    async def _parse(self, heard: str) -> Intent:
        try:
            intent = await self._muse.parse_intent(heard)
        except Exception:
            logger.warning("glasses: parse_intent failed, using fallback")
            return fallback_intent(heard)
        if intent.intent == "start_move":
            text = clean(intent.text, MAX_TEXT)
            if text:
                return Intent(intent.intent, text, intent.audience_hint)
        return fallback_intent(heard)

    def _nearest(self, lat: float | None, lng: float | None) -> MarkSnapshot | None:
        if lat is None or lng is None:
            return None
        found = self._marks.nearest(lat, lng, 1)
        return found[0] if found else None

    async def _compose(
        self, user_id: str, text: str, mark_id: str | None
    ) -> MoveDraftOut:
        try:
            draft = await self._muse.compose_move(
                user_id, mark_id=mark_id, seed_text=text
            )
        except Exception:
            logger.warning("glasses: compose_move failed, using plain draft")
            return MoveDraftOut(mark_id=mark_id, text=text, category=FALLBACK_CATEGORY)
        mark = mark_id or draft.mark_id
        return replace(draft, mark_id=mark, text=clean(draft.text, MAX_TEXT) or text)

    def _place(
        self, user_id: str, draft: MoveDraftOut, nearest: MarkSnapshot | None
    ) -> tuple[MoveDraftOut, MarkSnapshot | None, PlaceSource | None]:
        """Pick the Mark. Order: nearest to the sent coordinates, the place Muse
        chose, a place named in the utterance, the user's usual spot, and in
        DEMO_MODE the demo Mark. Never reads stored GPS."""
        if nearest is not None and draft.mark_id == nearest.id:
            return draft, nearest, "nearby"
        chosen = self._marks.get(draft.mark_id) if draft.mark_id else None
        if chosen is not None:
            return draft, chosen, "muse"
        found = self._fallback(user_id, draft.text)
        if found is not None:
            return replace(draft, mark_id=found[0].id), found[0], found[1]
        return replace(draft, mark_id=None), None, None

    def _phone_mark(self, user_id: str) -> MarkSnapshot | None:
        """The seeded Mark nearest the phone's last fresh coarse point, within
        PHONE_RADIUS_M. The point never leaves this method."""
        point = self._phone_point(user_id) if self._phone_point else None
        if point is None:
            return None
        found = self._marks.nearest(point[0], point[1], 1)
        if not found:
            return None
        near = distance_m(point[0], point[1], found[0].lat, found[0].lng)
        return found[0] if near <= PHONE_RADIUS_M else None

    def _fallback(
        self, user_id: str, text: str
    ) -> tuple[MarkSnapshot, PlaceSource] | None:
        """A real Mark when nothing was pinned: one named in the text, the user's
        usual one, and in DEMO_MODE the demo Mark. Never a city-level place."""
        tries: list[tuple[PlaceSource, Callable[[], MarkSnapshot | None]]] = [
            ("named", lambda: self._places.named_in(text)),
            ("phone", lambda: self._phone_mark(user_id)),
            ("usual", lambda: self._places.usual_for(user_id)),
        ]
        if self._demo_mode():
            tries.append(("demo", self._places.demo_mark))
        for source, find in tries:
            found = find()
            if found is not None:
                return found, source
        return None

    @staticmethod
    def _spoken(text: str, mark: MarkSnapshot, source: PlaceSource | None) -> str:
        said = clean(text, MAX_SPOKEN_TEXT)
        name = clean(mark.name, MAX_SPOKEN_TEXT)
        note = ", your usual spot" if source == "usual" else ""
        return f"{said} at {name}{note}. Say confirm to post."

    @staticmethod
    def _to_create(draft: MoveDraftOut) -> MoveCreate:
        assert draft.mark_id is not None
        return MoveCreate(
            mark_id=draft.mark_id,
            text=draft.text,
            category=draft.category,
            circle_ids=draft.circle_ids,
            user_ids=draft.user_ids,
            kind=draft.kind,
            fill_minutes=draft.fill_minutes,
            origin="glasses",
        )

    async def _announce(self, move_id: str) -> None:
        """Muse nudges the audience. Best effort: the Move is already posted."""
        try:
            await self._muse.notify_move(move_id)
        except Exception:
            logger.warning("glasses: notify_move failed for %s", move_id)

    @staticmethod
    def _result(move_id: str, draft: MoveDraftOut) -> ConfirmResult:
        return ConfirmResult(
            move_id=move_id,
            text=draft.text,
            spoken=f"Posted: {clean(draft.text, MAX_SPOKEN_TEXT)}.",
        )


# -- process-wide wiring ------------------------------------------------------

_drafts: DraftStore | None = None
_lock: asyncio.Lock | None = None


_places: PlaceFinder | None = None
_demo_mode: Callable[[], bool] | None = None
_creator: PlaceCreator | None = None
_phone_point: Callable[[str], tuple[float, float] | None] | None = None


def install(
    drafts: DraftStore,
    places: PlaceFinder | None = None,
    demo_mode: Callable[[], bool] | None = None,
    creator: PlaceCreator | None = None,
    phone_point: Callable[[str], tuple[float, float] | None] | None = None,
) -> DraftStore:
    """Called by `app/lanes/surfaces.py` at startup; replaces any earlier store."""
    global _drafts, _lock, _places, _demo_mode, _creator, _phone_point
    _drafts, _lock, _places, _demo_mode = drafts, asyncio.Lock(), places, demo_mode
    _creator = creator
    _phone_point = phone_point
    return drafts


def service_for(container: Container) -> GlassesService:
    """The service over the container's current ports and the installed store.

    Without the surfaces lane registered (`lanes=()`), a store is installed on
    first use so the routes still work.
    """
    if _drafts is None or _lock is None:
        install(DraftStore(lambda: container.clock.now()))
    assert _drafts is not None and _lock is not None
    return GlassesService(
        clock=container.clock,
        muse=container.muse,
        marks=container.marks,
        moves=container.moves,
        drafts=_drafts,
        lock=_lock,
        places=_places,
        demo_mode=_demo_mode or (lambda: False),
        creator=_creator,
        phone_point=_phone_point,
    )
