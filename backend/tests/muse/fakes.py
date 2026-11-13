"""Fakes of foreign ports for muse-lane tests only.

Never import another lane's fakes: a bug in theirs must not mask or break yours.
"""

from __future__ import annotations

import itertools
from collections.abc import Collection, Iterable
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

from app.ports import (
    EndReason,
    EventType,
    FreeWindow,
    JoinedVia,
    MarkSnapshot,
    MoveCreate,
    MoveSnapshot,
    ParticipantSnapshot,
    ParticipantStatus,
    SaveSource,
)


class FixedClock:
    """A `Clock` that only moves when told to."""

    def __init__(self, now: datetime) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)


class RecordingPublisher:
    """An `EventPublisher` that keeps every publish as `(user_ids, type, data)`."""

    def __init__(self) -> None:
        self.published: list[tuple[frozenset[str], EventType, dict[str, Any]]] = []

    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        self.published.append((frozenset(user_ids), type, data))

    def of_type(self, type: EventType) -> list[tuple[frozenset[str], dict[str, Any]]]:
        return [(users, data) for users, t, data in self.published if t == type]


class FakeMoveGateway:
    """In-memory `MoveGateway`: Moves, audiences, and every mutation recorded."""

    def __init__(self, clock: FixedClock) -> None:
        self.clock = clock
        self.moves: dict[str, MoveSnapshot] = {}
        self.audiences: dict[str, frozenset[str]] = {}
        self.created: list[tuple[str, MoveCreate]] = []
        self.added: list[tuple[str, str, str, str]] = []
        self.ended: list[tuple[str, str]] = []
        self._ids = itertools.count(1)

    def put(self, move: MoveSnapshot, audience: Collection[str] = ()) -> MoveSnapshot:
        self.moves[move.id] = move
        self.audiences[move.id] = frozenset(audience)
        return move

    def get(self, move_id: str) -> MoveSnapshot | None:
        return self.moves.get(move_id)

    def audience_ids(self, move_id: str) -> frozenset[str]:
        return self.audiences.get(move_id, frozenset())

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        return [
            m
            for m in self.moves.values()
            if m.status == "live"
            and (viewer_id in self.audiences.get(m.id, ()) or m.creator_id == viewer_id)
        ]

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        self.created.append((creator_id, draft))
        now = self.clock.now()
        move = MoveSnapshot(
            id=f"created{next(self._ids)}",
            creator_id=creator_id,
            mark=MarkSnapshot(draft.mark_id, draft.mark_id, draft.category, 0, 0, ""),
            text=draft.text,
            category=draft.category,
            status="live",
            kind=draft.kind,
            open=draft.open,
            origin=draft.origin,
            starts_at=now,
            created_at=now,
            origin_ref=draft.origin_ref,
            fill_deadline=(
                now + timedelta(minutes=draft.fill_minutes)
                if draft.fill_minutes
                else None
            ),
            notify_user_ids=draft.notify_user_ids,
            participants=(ParticipantSnapshot(creator_id, "going", "creator", now),),
        )
        return self.put(move, set(draft.user_ids))

    async def add_participant(
        self,
        move_id: str,
        user_id: str,
        status: ParticipantStatus,
        joined_via: JoinedVia,
    ) -> None:
        self.added.append((move_id, user_id, status, joined_via))

    async def end(self, move_id: str, reason: EndReason) -> None:
        self.ended.append((move_id, reason))
        if move_id in self.moves:
            self.moves[move_id] = replace(self.moves[move_id], status="ended")

    async def end_stale(self) -> list[str]:
        return []


class FakeMarkGateway:
    def __init__(self, marks: Iterable[MarkSnapshot] = ()) -> None:
        self.marks = {m.id: m for m in marks}
        self.nearest_calls: list[tuple[float, float, int]] = []

    def get(self, mark_id: str) -> MarkSnapshot | None:
        return self.marks.get(mark_id)

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        self.nearest_calls.append((lat, lng, limit))
        ranked = sorted(
            self.marks.values(), key=lambda m: (m.lat - lat) ** 2 + (m.lng - lng) ** 2
        )
        return ranked[:limit]

    def save(
        self, user_id: str, mark_id: str, source: SaveSource, source_ref: str | None
    ) -> None:
        pass

    def unsave(self, user_id: str, mark_id: str) -> None:
        pass

    def mark_flared(self, user_id: str, mark_id: str) -> None:
        raise AssertionError("the muse lane must never write saved_marks.flared_at")


class FakeProximity:
    def __init__(
        self,
        clusters: dict[str, Collection[str]] | None = None,
        open_moves: dict[str, list[str]] | None = None,
    ) -> None:
        self.clusters = {k: frozenset(v) for k, v in (clusters or {}).items()}
        self.open_moves = open_moves or {}

    def copresent_cluster(self, user_id: str) -> frozenset[str]:
        return self.clusters.get(user_id, frozenset())

    def open_moves_near(self, user_id: str) -> list[str]:
        return list(self.open_moves.get(user_id, []))


class FakeCalendar:
    """Free windows per user; `None` (or missing) means busy / unknown."""

    def __init__(self, windows: dict[str, FreeWindow | None] | None = None) -> None:
        self.windows = dict(windows or {})

    def free_window(self, user_id: str, now: datetime) -> FreeWindow | None:
        return self.windows.get(user_id)


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str, str, dict[str, str]]] = []

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        self.sent.append((user_id, type, title, body, data))
        return f"n{len(self.sent)}"
