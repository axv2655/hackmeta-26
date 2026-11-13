"""The cross-lane contract: shared vocabulary, snapshots and ports.

Behavior crosses lanes only through the Protocols below (docs/BACKEND_TASKS.md
section 3). Each port has one owning lane that implements it and registers the
implementation on the `Container` from `app/lanes/<lane>.py`; every other lane
consumes it and fakes it in its own tests. `app/ports_null.py` holds a safe
no-op for each, so any lane runs with the other two absent.

Snapshots are frozen dataclasses, not table rows: a consumer can never write
through one, and a session closing cannot invalidate one. Sequences are tuples
so snapshots stay immutable and hashable.

All datetimes are timezone-aware UTC and come from the `Clock` port.

Frozen: changing this file needs an issue that all three lane owners approve.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol, runtime_checkable

# --- Vocabulary (ARCHITECTURE.md sections 5, 9) ------------------------------

Category = Literal[
    "food",
    "coffee",
    "study",
    "fitness",
    "nightlife",
    "outdoors",
    "games",
    "shopping",
    "errand",
    "other",
]
MarkSource = Literal["seed", "user", "reel"]
SaveSource = Literal["map", "reel"]

MoveStatus = Literal["live", "ended", "cancelled"]
MoveKind = Literal["move", "flare"]
MoveOrigin = Literal[
    "manual",
    "map",
    "reel",
    "saved_flare",
    "free_time",
    "revive",
    "glasses",
    "nobody_bit",
]
EndReason = Literal["creator", "everyone_left", "stale", "nobody_bit"]
AudienceVia = str  # "circle:<id>" | "direct" | "open_ble"

ParticipantStatus = Literal["going", "there", "left"]
JoinedVia = Literal["creator", "tap", "ble_prompt", "ble_auto", "open_ble"]

MomentStatus = Literal["pending", "approved"]
MediaType = Literal["photo", "clip"]

HourBucket = Literal["morning", "lunch", "afternoon", "evening", "late"]
CalendarSource = Literal["mock", "device"]
SightingSource = Literal["ble", "sim"]
ProximityTokenKind = Literal["user", "move"]

SuggestionType = Literal[
    "flare", "free_time", "revive", "route", "reel_move", "nobody_bit"
]
SuggestionStatus = Literal["pending", "accepted", "dismissed", "expired"]
TasteSubject = Literal["user", "pseudo_group"]

NotificationType = Literal[
    "move_nudge",
    "friend_pulling_up",
    "joined_your_move",
    "proximity_added",
    "muse_flare",
    "muse_free_time",
    "muse_revive",
    "rate_move",
    "moment_approval",
    "muse_nobody_bit",
    "muse_route",
    "friend_request",
    "friend_accepted",
]
EventType = Literal[
    "notification",
    "move.created",
    "move.updated",
    "move.ended",
    "participant.changed",
    "proximity.prompt",
    "suggestion.created",
    "moment.added",
    "moment.approval_needed",
    "rating.prompt",
]
IntentKind = Literal["start_move", "none"]


class PortUnavailable(RuntimeError):
    """A port that must return a value has no implementation registered.

    Raised only by null ports whose method cannot invent a result (for example
    `MoveGateway.create`). The API maps it to 503.
    """


# --- Snapshots ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MarkSnapshot:
    id: str
    name: str
    category: Category
    lat: float
    lng: float
    address: str
    vibe_tags: tuple[str, ...] = ()
    photo_url: str | None = None
    price_level: int | None = None
    source: MarkSource = "seed"


@dataclass(frozen=True, slots=True)
class ParticipantSnapshot:
    user_id: str
    status: ParticipantStatus
    joined_via: JoinedVia
    joined_at: datetime
    arrived_at: datetime | None = None
    left_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class MoveSnapshot:
    """A Move as other lanes see it. Never contains the audience list; ask
    `MoveGateway.audience_ids` for that."""

    id: str
    creator_id: str
    mark: MarkSnapshot
    text: str
    category: Category
    status: MoveStatus
    kind: MoveKind
    open: bool
    origin: MoveOrigin
    starts_at: datetime
    created_at: datetime
    participants: tuple[ParticipantSnapshot, ...] = ()
    origin_ref: str | None = None
    fill_deadline: datetime | None = None
    ends_at: datetime | None = None
    notify_user_ids: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class MoveCreate:
    """Everything `MoveGateway.create` needs. Core resolves the audience from
    `circle_ids` + `user_ids`, sets `fill_deadline` from `fill_minutes` and the
    Clock, and stores `notify_user_ids` (the creator's edited notify list, None
    to let Muse pick) for the notify pipeline. `creator_there` is True when the
    client reports the creator inside the Mark's geofence (7.2)."""

    mark_id: str
    text: str
    category: Category
    circle_ids: tuple[str, ...] = ()
    user_ids: tuple[str, ...] = ()
    kind: MoveKind = "move"
    open: bool = False
    fill_minutes: int | None = None
    origin: MoveOrigin = "manual"
    origin_ref: str | None = None
    creator_there: bool = False
    notify_user_ids: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class FreeWindow:
    start: datetime
    end: datetime

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


@dataclass(frozen=True, slots=True)
class NotifyPickOut:
    user_id: str
    copy: str
    reason: str
    source: str = "heuristic"


@dataclass(frozen=True, slots=True)
class MoveDraftOut:
    """A composer prefill (API `MoveDraft`). `mark_id` is None when Muse had no
    place to go on; `nearby_mark_ids` are the alternatives, nearest first."""

    mark_id: str | None
    text: str
    category: Category
    kind: MoveKind = "move"
    alternates: tuple[str, ...] = ()
    circle_ids: tuple[str, ...] = ()
    user_ids: tuple[str, ...] = ()
    notify: tuple[NotifyPickOut, ...] = ()
    fill_minutes: int | None = None
    chips: tuple[str, ...] = ()
    nearby_mark_ids: tuple[str, ...] = ()
    source: str = "heuristic"


@dataclass(frozen=True, slots=True)
class RankedMove:
    move_id: str
    reason: str


@dataclass(frozen=True, slots=True)
class NewMarkDraft:
    name: str
    category: Category
    vibe_tags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PlaceResolution:
    """At most one of `mark_id` / `new_mark` is set. Below 0.6 confidence the
    UI asks "Is this X?" (10.4)."""

    mark_id: str | None
    confidence: float
    new_mark: NewMarkDraft | None = None


@dataclass(frozen=True, slots=True)
class Intent:
    intent: IntentKind
    text: str
    audience_hint: str | None = None


@dataclass(frozen=True, slots=True)
class SuggestionSnapshot:
    id: str
    user_id: str
    type: SuggestionType
    status: SuggestionStatus
    message: str
    created_at: datetime
    expires_at: datetime
    chips: tuple[str, ...] = ()
    draft: MoveDraftOut | None = None


# --- Ports -------------------------------------------------------------------


@runtime_checkable
class Clock(Protocol):
    """Implemented by core (C1). The only source of "now" in the backend."""

    def now(self) -> datetime: ...


@runtime_checkable
class TimeControl(Protocol):
    """Implemented by core (C1), consumed by demo control (S10)."""

    def set_time(self, iso: str) -> None: ...

    def shift(self, minutes: float) -> None: ...

    def reset(self) -> None: ...


@runtime_checkable
class EventPublisher(Protocol):
    """Implemented by core (C9). Pushes `{type, data, ts}` to user sockets."""

    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None: ...


@runtime_checkable
class PushSender(Protocol):
    """Phone pushes (APNs) for a notification that was just stored. Never
    raises: a failed push must not break the notification."""

    async def push(
        self, user_ids: Iterable[str], title: str, body: str, data: dict[str, str]
    ) -> None: ...


@runtime_checkable
class Notifier(Protocol):
    """Implemented by muse (M4). Stores a notification, publishes it, and
    returns its id. Put the Move id in `data["move_id"]` when there is one."""

    async def send(
        self,
        user_id: str,
        type: NotificationType,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> str: ...


@runtime_checkable
class MoveGateway(Protocol):
    """Implemented by core (C4). Mutations are async because they publish
    events and fire lifecycle hooks before returning."""

    def get(self, move_id: str) -> MoveSnapshot | None: ...

    def audience_ids(self, move_id: str) -> frozenset[str]: ...

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]: ...

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot: ...

    async def add_participant(
        self,
        move_id: str,
        user_id: str,
        status: ParticipantStatus,
        joined_via: JoinedVia,
    ) -> None:
        """`joined_via="open_ble"` also adds the user to the audience."""

    async def end(self, move_id: str, reason: EndReason) -> None: ...

    async def end_stale(self) -> list[str]: ...


@runtime_checkable
class MarkGateway(Protocol):
    """Implemented by core (C6)."""

    def get(self, mark_id: str) -> MarkSnapshot | None: ...

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]: ...

    def save(
        self, user_id: str, mark_id: str, source: SaveSource, source_ref: str | None
    ) -> None: ...

    def unsave(self, user_id: str, mark_id: str) -> None: ...

    def mark_flared(self, user_id: str, mark_id: str) -> None:
        """Stamp `saved_marks.flared_at` so the flare agent skips it for a while."""


@runtime_checkable
class UserGateway(Protocol):
    """Implemented by core (C7). Writes to core-owned people tables."""

    def add_autojoin(self, user_id: str, other_user_id: str) -> None: ...


@runtime_checkable
class MuseGateway(Protocol):
    """Implemented by muse (M1, M4 to M11). Every method falls back instead of
    raising when Muse is slow or wrong."""

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut: ...

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        """Run the notify pipeline for an existing Move and send the picks."""

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]: ...

    async def resolve_place(
        self,
        user_id: str,
        *,
        geotag_mark_id: str | None = None,
        caption: str | None = None,
        coarse: tuple[float, float] | None = None,
        frame_url: str | None = None,
    ) -> PlaceResolution: ...

    async def parse_intent(self, utterance: str) -> Intent: ...

    async def run_flare_scan(self, user_id: str) -> SuggestionSnapshot | None: ...

    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None: ...

    async def run_nobody_bit(self, move_id: str) -> SuggestionSnapshot | None: ...

    async def run_route(
        self, move_id: str, user_ids: Sequence[str]
    ) -> SuggestionSnapshot | None: ...

    def muse_stats(self) -> dict[str, Any]: ...


@runtime_checkable
class ProximityGateway(Protocol):
    """Implemented by surfaces (S1)."""

    def copresent_cluster(self, user_id: str) -> frozenset[str]:
        """Users co-present with `user_id` right now (connected component of
        the co-presence graph), excluding `user_id` itself."""

    def open_moves_near(self, user_id: str) -> list[str]:
        """Ids of open Moves the user may discover and join over BLE."""


@runtime_checkable
class CalendarGateway(Protocol):
    """Implemented by surfaces (S5)."""

    def free_window(self, user_id: str, now: datetime) -> FreeWindow | None: ...
