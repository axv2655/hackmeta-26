"""Safe no-op implementation of every port in `app/ports.py`.

The `Container` starts with these, so the app boots and each lane runs with
the other two absent. Rules: reads return empty, side-effect-only commands do
nothing, and a command that must return something it cannot invent raises
`PortUnavailable` (mapped to 503).
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from datetime import datetime
from typing import Any

from app.core.clock import SystemClock
from app.ports import (
    EndReason,
    EventType,
    FreeWindow,
    Intent,
    JoinedVia,
    MarkSnapshot,
    MoveCreate,
    MoveDraftOut,
    MoveSnapshot,
    NotificationType,
    NotifyPickOut,
    ParticipantStatus,
    PlaceResolution,
    PortUnavailable,
    RankedMove,
    SaveSource,
    SuggestionSnapshot,
)


class NullClock(SystemClock):
    """Without the core lane, time is plain system time."""


class NullTimeControl:
    def set_time(self, iso: str) -> None:
        pass

    def shift(self, minutes: float) -> None:
        pass

    def reset(self) -> None:
        pass


class NullEventPublisher:
    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        pass


class NullPushSender:
    async def push(
        self, user_ids: Iterable[str], title: str, body: str, data: dict[str, str]
    ) -> None:
        pass


class NullNotifier:
    async def send(
        self,
        user_id: str,
        type: NotificationType,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> str:
        """Nothing is stored, so there is no id: returns ""."""
        return ""


class NullMoveGateway:
    def get(self, move_id: str) -> MoveSnapshot | None:
        return None

    def audience_ids(self, move_id: str) -> frozenset[str]:
        return frozenset()

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        return []

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        raise PortUnavailable("MoveGateway.create: core lane not registered")

    async def add_participant(
        self,
        move_id: str,
        user_id: str,
        status: ParticipantStatus,
        joined_via: JoinedVia,
    ) -> None:
        pass

    async def end(self, move_id: str, reason: EndReason) -> None:
        pass

    async def end_stale(self) -> list[str]:
        return []


class NullMarkGateway:
    def get(self, mark_id: str) -> MarkSnapshot | None:
        return None

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        return []

    def save(
        self, user_id: str, mark_id: str, source: SaveSource, source_ref: str | None
    ) -> None:
        pass

    def unsave(self, user_id: str, mark_id: str) -> None:
        pass

    def mark_flared(self, user_id: str, mark_id: str) -> None:
        pass


class NullUserGateway:
    def add_autojoin(self, user_id: str, other_user_id: str) -> None:
        pass


class NullMuseGateway:
    """Behaves like Muse with every call falling back to the plainest answer."""

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut:
        return MoveDraftOut(
            mark_id=mark_id, text=seed_text or "who's down?", category="other"
        )

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        return []

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]:
        return [RankedMove(move_id=move.id, reason="") for move in moves]

    async def resolve_place(
        self,
        user_id: str,
        *,
        geotag_mark_id: str | None = None,
        caption: str | None = None,
        coarse: tuple[float, float] | None = None,
        frame_url: str | None = None,
    ) -> PlaceResolution:
        return PlaceResolution(
            mark_id=geotag_mark_id, confidence=1.0 if geotag_mark_id else 0.0
        )

    async def parse_intent(self, utterance: str) -> Intent:
        return Intent(intent="none", text=utterance)

    async def run_flare_scan(self, user_id: str) -> SuggestionSnapshot | None:
        return None

    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None:
        return None

    async def run_nobody_bit(self, move_id: str) -> SuggestionSnapshot | None:
        return None

    async def run_route(
        self, move_id: str, user_ids: Sequence[str]
    ) -> SuggestionSnapshot | None:
        return None

    def muse_stats(self) -> dict[str, Any]:
        return {}


class NullProximityGateway:
    def copresent_cluster(self, user_id: str) -> frozenset[str]:
        return frozenset()

    def open_moves_near(self, user_id: str) -> list[str]:
        return []


class NullCalendarGateway:
    def free_window(self, user_id: str, now: datetime) -> FreeWindow | None:
        return None
