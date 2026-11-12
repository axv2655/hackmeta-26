"""Mark use cases (ARCHITECTURE.md 5.2, 7.1, 7.4, 13.2, 14.2) and `MarkGateway`.

* `nearby`: Marks within a radius that the viewer saved or that carry ghosts,
  nearest first. Bounding-box prefilter in SQL, exact haversine in Python.
* `search`, `create`, `detail` (scores, ghosts, recent Moments), save/unsave
  and the viewer's saved list.

Ghosts (7.4): a participant who `left` a Move, or was still `there` when it
ended, shows as a gray avatar at its Mark for `GHOST_WINDOW`. Only viewers who
may see that Move (`visible_to`, i.e. the original `move_audience`, the
creator and participants) see the ghost, and never when its user turned
`ghost_visible` off or hides their Moves from the viewer.

Scores come from `mark_rankings` (13.2): `score` is the viewer's own,
`friends_score` the friends' mean; both None when nobody ranked the Mark.

Build one per session: `MarkService(SqlMarkRepository(session), clock)`.
Outside a request use `SqlMarkGateway`, which opens one session per call.
"""

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from statistics import fmean
from typing import get_args

from app.domain.errors import Invalid, MarkNotFound
from app.domain.records import Moment, Reel, SavedMark, SavedReel, User
from app.ports import Category, Clock, MarkSnapshot, SaveSource
from app.repositories.marks import (
    Box,
    GhostCandidate,
    MarkRepository,
    NewMark,
)

GHOST_WINDOW = timedelta(hours=24)
MOMENTS_LIMIT = 12
EARTH_RADIUS_KM = 6371.0088

MAX_NAME = 80
MAX_ADDRESS = 200
MAX_TAGS = 8
MAX_TAG = 24
CATEGORIES: frozenset[str] = frozenset(get_args(Category))


class InvalidMark(Invalid):
    """A new Mark breaks an invariant (blank name, bad coordinates, ...)."""


# --- Pure helpers ------------------------------------------------------------


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def bounding_box(lat: float, lng: float, radius_km: float) -> Box:
    """A box that contains every point within `radius_km`. Does not wrap the
    antimeridian (the demo world is one city)."""
    dlat = math.degrees(radius_km / EARTH_RADIUS_KM)
    cos_lat = max(math.cos(math.radians(lat)), 1e-6)
    dlng = math.degrees(radius_km / (EARTH_RADIUS_KM * cos_lat))
    return Box(
        min_lat=max(lat - dlat, -90.0),
        max_lat=min(lat + dlat, 90.0),
        min_lng=max(lng - dlng, -180.0),
        max_lng=min(lng + dlng, 180.0),
    )


def ghost_at(c: GhostCandidate) -> datetime | None:
    """When the participant became a ghost: on leaving, or when the Move
    ended while they were still there."""
    if c.status == "left":
        return c.left_at
    if c.move_status == "ended":
        return c.ends_at
    return None


def is_ghost(at: datetime | None, now: datetime) -> bool:
    return at is not None and now - GHOST_WINDOW <= at <= now


def normalize_tags(tags: Iterable[str]) -> tuple[str, ...]:
    """Lowercase, trimmed, de-duplicated, blanks dropped, order kept."""
    cleaned = (t.strip().lower() for t in tags)
    unique = tuple(dict.fromkeys(t for t in cleaned if t))
    if len(unique) > MAX_TAGS or any(len(t) > MAX_TAG for t in unique):
        raise InvalidMark(f"at most {MAX_TAGS} vibe tags of {MAX_TAG} characters")
    return unique


# --- Views -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MarkView:
    """A Mark as one viewer sees it (API `Mark`)."""

    mark: MarkSnapshot
    saved: bool = False
    score: float | None = None
    friends_score: float | None = None


@dataclass(frozen=True, slots=True)
class Ghost:
    user: User
    move_id: str
    at: datetime


@dataclass(frozen=True, slots=True)
class NearbyMark:
    view: MarkView
    distance_km: float
    ghosts: tuple[Ghost, ...]


@dataclass(frozen=True, slots=True)
class MomentView:
    moment: Moment
    author: User


@dataclass(frozen=True, slots=True)
class TopRanker:
    user: User
    score: float


@dataclass(frozen=True, slots=True)
class MarkDetail:
    view: MarkView
    ghosts: tuple[Ghost, ...]
    moments: tuple[MomentView, ...]
    moves_count: int
    top_ranker: TopRanker | None


@dataclass(frozen=True, slots=True)
class SavedMarkView:
    view: MarkView
    row: SavedMark


@dataclass(frozen=True, slots=True)
class SavedItems:
    marks: tuple[SavedMarkView, ...]
    reels: tuple[tuple[SavedReel, Reel], ...]


@dataclass(frozen=True, slots=True)
class MarkInput:
    name: str
    category: Category
    lat: float
    lng: float
    address: str = ""
    photo_url: str | None = None
    price_level: int | None = None
    vibe_tags: tuple[str, ...] = ()


# --- Service -----------------------------------------------------------------


class MarkService:
    def __init__(self, repository: MarkRepository, clock: Clock) -> None:
        self.repo = repository
        self.clock = clock

    # --- Reads ---------------------------------------------------------------

    def get(self, mark_id: str) -> MarkSnapshot | None:
        return self.repo.get(mark_id)

    def require(self, mark_id: str) -> MarkSnapshot:
        mark = self.repo.get(mark_id)
        if mark is None:
            raise MarkNotFound(mark_id)
        return mark

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        """Any Marks, nearest first (ties by id). Scans every Mark: the world
        is a seeded city of a few dozen."""
        if limit <= 0:
            return []
        marks = self.repo.within(None)
        marks.sort(key=lambda m: (distance_km(lat, lng, m.lat, m.lng), m.id))
        return marks[:limit]

    def nearby(
        self, viewer_id: str, lat: float, lng: float, radius_km: float, limit: int
    ) -> list[NearbyMark]:
        """Saved Marks and Marks with ghosts within `radius_km`, nearest first."""
        in_box = self.repo.within(bounding_box(lat, lng, radius_km))
        distances = {m.id: distance_km(lat, lng, m.lat, m.lng) for m in in_box}
        marks = [m for m in in_box if distances[m.id] <= radius_km]
        ids = [m.id for m in marks]
        saved = self.repo.saved_ids(viewer_id, ids)
        ghosts = self._ghosts(viewer_id, ids)
        shown = [m for m in marks if m.id in saved or ghosts.get(m.id)]
        shown.sort(key=lambda m: (distances[m.id], m.id))
        shown = shown[: max(limit, 0)]
        views = self.views(viewer_id, shown)
        return [
            NearbyMark(view, distances[view.mark.id], ghosts.get(view.mark.id, ()))
            for view in views
        ]

    def search(self, viewer_id: str, query: str, limit: int) -> list[MarkView]:
        text = query.strip()
        if not text:
            raise InvalidMark("search text is empty")
        return self.views(viewer_id, self.repo.search(text, limit))

    def detail(self, viewer_id: str, mark_id: str) -> MarkDetail:
        mark = self.require(mark_id)
        [view] = self.views(viewer_id, [mark])
        moments = self.repo.moments(viewer_id, mark_id, MOMENTS_LIMIT)
        authors = self.repo.users(m.author_id for m in moments)
        return MarkDetail(
            view=view,
            ghosts=self._ghosts(viewer_id, [mark_id]).get(mark_id, ()),
            moments=tuple(MomentView(m, authors[m.author_id]) for m in moments),
            moves_count=self.repo.moves_count(viewer_id, mark_id),
            top_ranker=self._top_ranker(viewer_id, mark_id),
        )

    def saved(self, user_id: str) -> SavedItems:
        rows = self.repo.saved_marks(user_id)
        views = self.views(user_id, [mark for _, mark in rows])
        return SavedItems(
            marks=tuple(SavedMarkView(v, row) for v, (row, _) in zip(views, rows)),
            reels=tuple(self.repo.saved_reels(user_id)),
        )

    def views(self, viewer_id: str, marks: Sequence[MarkSnapshot]) -> list[MarkView]:
        """Add the viewer's saved flag and scores, keeping the order."""
        ids = [m.id for m in marks]
        saved = self.repo.saved_ids(viewer_id, ids)
        friends = self.repo.friend_ids(viewer_id)
        own: dict[str, float] = {}
        theirs: dict[str, list[float]] = {}
        for r in self.repo.rankings(ids, friends | {viewer_id}):
            if r.user_id == viewer_id:
                own[r.mark_id] = r.score
            else:
                theirs.setdefault(r.mark_id, []).append(r.score)
        return [
            MarkView(
                mark=m,
                saved=m.id in saved,
                score=own.get(m.id),
                friends_score=round(fmean(theirs[m.id]), 1) if m.id in theirs else None,
            )
            for m in marks
        ]

    # --- Writes --------------------------------------------------------------

    def create(self, creator_id: str, data: MarkInput) -> MarkView:
        name = data.name.strip()
        if not name or len(name) > MAX_NAME:
            raise InvalidMark(f"name must be 1 to {MAX_NAME} characters")
        if data.category not in CATEGORIES:
            raise InvalidMark(f"unknown category {data.category!r}")
        if not (-90 <= data.lat <= 90 and -180 <= data.lng <= 180):
            raise InvalidMark("coordinates out of range")
        if data.price_level is not None and not 1 <= data.price_level <= 4:
            raise InvalidMark("price_level must be 1 to 4")
        address = data.address.strip()
        if len(address) > MAX_ADDRESS:
            raise InvalidMark(f"address over {MAX_ADDRESS} characters")
        mark = self.repo.create(
            NewMark(
                name=name,
                category=data.category,
                lat=data.lat,
                lng=data.lng,
                address=address,
                photo_url=data.photo_url,
                price_level=data.price_level,
                vibe_tags=normalize_tags(data.vibe_tags),
                created_by=creator_id,
            )
        )
        self.repo.commit()
        return MarkView(mark)

    def save(
        self,
        user_id: str,
        mark_id: str,
        source: SaveSource = "map",
        source_ref: str | None = None,
    ) -> None:
        """Idempotent; keeps the first `saved_at`. A Reel save on a Mark saved
        from the map records the Reel; a map save never overwrites a Reel."""
        self.require(mark_id)
        row = self.repo.saved_row(user_id, mark_id)
        if row is None:
            row = SavedMark(
                user_id=user_id,
                mark_id=mark_id,
                source=source,
                source_ref=source_ref,
                saved_at=self.clock.now(),
            )
        elif source == "reel":
            row = replace(row, source=source, source_ref=source_ref)
        else:
            return
        self.repo.put_saved(row)
        self.repo.commit()

    def unsave(self, user_id: str, mark_id: str) -> None:
        """Idempotent."""
        self.repo.delete_saved(user_id, mark_id)
        self.repo.commit()

    def mark_flared(self, user_id: str, mark_id: str) -> None:
        """Stamp `flared_at` on the Saved Mark; no-op when not saved."""
        row = self.repo.saved_row(user_id, mark_id)
        if row is None:
            return
        row = replace(row, flared_at=self.clock.now())
        self.repo.put_saved(row)
        self.repo.commit()

    # --- Internals -----------------------------------------------------------

    def _ghosts(
        self, viewer_id: str, mark_ids: Sequence[str]
    ) -> dict[str, tuple[Ghost, ...]]:
        """Per Mark, one ghost per user (their latest), newest first."""
        now = self.clock.now()
        latest: dict[tuple[str, str], tuple[datetime, str]] = {}
        for c in self.repo.ghost_candidates(viewer_id, mark_ids, now - GHOST_WINDOW):
            at = ghost_at(c)
            if at is None or not is_ghost(at, now):
                continue
            key = (c.mark_id, c.user_id)
            if key not in latest or at > latest[key][0]:
                latest[key] = (at, c.move_id)
        users = self.repo.users(uid for _, uid in latest)
        by_mark: dict[str, list[Ghost]] = {}
        for (mark_id, uid), (at, move_id) in latest.items():
            by_mark.setdefault(mark_id, []).append(Ghost(users[uid], move_id, at))
        return {
            mark_id: tuple(sorted(gs, key=lambda g: (-g.at.timestamp(), g.user.id)))
            for mark_id, gs in by_mark.items()
        }

    def _top_ranker(self, viewer_id: str, mark_id: str) -> TopRanker | None:
        """Who ranked the Mark highest among the viewer and their friends."""
        people = self.repo.friend_ids(viewer_id) | {viewer_id}
        rankings = self.repo.rankings([mark_id], people)
        if not rankings:
            return None
        best = max(rankings, key=lambda r: (r.score, r.user_id == viewer_id))
        user = self.repo.users([best.user_id])[best.user_id]
        return TopRanker(user, best.score)

