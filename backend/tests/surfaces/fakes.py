"""Fakes of foreign ports for surfaces-lane tests only.

Never import another lane's fakes: a bug in theirs must not mask or break yours.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from app.ports import (
    Intent,
    JoinedVia,
    MarkSnapshot,
    MoveCreate,
    MoveDraftOut,
    MoveSnapshot,
    NotifyPickOut,
    ParticipantSnapshot,
    ParticipantStatus,
)

T0 = datetime(2026, 11, 12, 15, 0, tzinfo=UTC)


class FakeClock:
    def __init__(self, now: datetime = T0) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now

    def advance(self, **delta: float) -> None:
        self._now += timedelta(**delta)


def mark(mark_id: str = "kumo", name: str = "Kumo") -> MarkSnapshot:
    return MarkSnapshot(
        id=mark_id,
        name=name,
        category="coffee",
        lat=30.28,
        lng=-97.74,
        address="1 Main St",
    )


class FakeMarks:
    """`nearest` records the coordinates it was asked about."""

    def __init__(self, *marks: MarkSnapshot) -> None:
        self.marks = {m.id: m for m in marks}
        self.nearest_calls: list[tuple[float, float, int]] = []

    def get(self, mark_id: str) -> MarkSnapshot | None:
        return self.marks.get(mark_id)

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        self.nearest_calls.append((lat, lng, limit))
        return list(self.marks.values())[:limit]


class FakeMoveGateway:
    """Core's MoveGateway as far as surfaces needs it, with a visible audience."""

    def __init__(self) -> None:
        self.created: list[tuple[str, MoveCreate]] = []
        self.moves: dict[str, MoveSnapshot] = {}
        self.audience: dict[str, frozenset[str]] = {}
        self.joined: list[tuple[str, str]] = []

    def add(
        self,
        move_id: str,
        creator_id: str,
        audience: tuple[str, ...] = (),
        participants: tuple[ParticipantSnapshot, ...] = (),
        status: str = "live",
        place: str = "Kumo",
    ) -> MoveSnapshot:
        move = MoveSnapshot(
            id=move_id,
            creator_id=creator_id,
            mark=mark("kumo", place),
            text="getting boba",
            category="coffee",
            status=status,  # type: ignore[arg-type]
            kind="move",
            open=False,
            origin="manual",
            starts_at=T0,
            created_at=T0,
            participants=participants
            or (ParticipantSnapshot(creator_id, "going", "creator", T0),),
        )
        self.moves[move_id] = move
        self.audience[move_id] = frozenset(audience)
        return move

    def get(self, move_id: str) -> MoveSnapshot | None:
        return self.moves.get(move_id)

    def audience_ids(self, move_id: str) -> frozenset[str]:
        return self.audience.get(move_id, frozenset())

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        return [
            m
            for m in self.moves.values()
            if m.status == "live"
            and (viewer_id == m.creator_id or viewer_id in self.audience_ids(m.id))
        ]

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        self.created.append((creator_id, draft))
        move = self.add(
            f"move-{len(self.created)}",
            creator_id,
            draft.user_ids,
            place=mark(draft.mark_id).name,
        )
        return move

    async def add_participant(
        self,
        move_id: str,
        user_id: str,
        status: ParticipantStatus,
        joined_via: JoinedVia,
    ) -> None:
        self.joined.append((move_id, user_id))
        move = self.moves[move_id]
        mine = ParticipantSnapshot(user_id, status, joined_via, T0)
        self.moves[move_id] = replace(move, participants=(*move.participants, mine))


class FakeMuse:
    """The slice of `MuseGateway` glasses uses. `down` makes every call raise;
    `intent` overrides what `parse_intent` returns."""

    def __init__(self) -> None:
        self.down = False
        self.intent: Intent | None = None
        self.compose_calls: list[dict[str, object]] = []
        self.notified: list[str] = []
        self.notify_calls: list[tuple[str, set[str], set[str]]] = []
        self.picks: tuple[NotifyPickOut, ...] = ()  # compose_move's draft notify
        self.choose: str | None = None  # a place Muse picks on its own

    async def parse_intent(self, utterance: str) -> Intent:
        if self.down:
            raise RuntimeError("muse is down")
        return self.intent or Intent(intent="start_move", text="getting boba")

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut:
        if self.down:
            raise RuntimeError("muse is down")
        self.compose_calls.append(
            {"mark_id": mark_id, "seed_text": seed_text, "coarse": coarse}
        )
        return MoveDraftOut(
            mark_id=mark_id or self.choose,
            text=seed_text or "",
            category="coffee",
            notify=self.picks,
        )

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        self.notified.append(move_id)
        self.notify_calls.append((move_id, set(force_ids), set(drop_ids)))
        return [NotifyPickOut(u, "pull up?", "friend") for u in force_ids]


class FakePlaces:
    """Canned answers for the three place fallbacks; records the calls."""

    def __init__(
        self,
        named: MarkSnapshot | None = None,
        usual: MarkSnapshot | None = None,
        demo: MarkSnapshot | None = None,
    ) -> None:
        self.named, self.usual, self.demo = named, usual, demo
        self.calls: list[str] = []

    def named_in(self, text: str) -> MarkSnapshot | None:
        self.calls.append("named")
        return self.named

    def usual_for(self, user_id: str) -> MarkSnapshot | None:
        self.calls.append("usual")
        return self.usual

    def demo_mark(self) -> MarkSnapshot | None:
        self.calls.append("demo")
        return self.demo


class FakeProximity:
    def __init__(self, together: Iterable[str] = ()) -> None:
        self.together = frozenset(together)

    def copresent_cluster(self, user_id: str) -> frozenset[str]:
        return self.together

    def open_moves_near(self, user_id: str) -> list[str]:
        return []


@dataclass
class FixedClock:
    at: datetime

    def now(self) -> datetime:
        return self.at


@dataclass
class SpyNotifier:
    sent: list[dict[str, Any]] = field(default_factory=list)
    fail_for: frozenset[str] = frozenset()

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        if user_id in self.fail_for:
            raise RuntimeError("notifier down")
        self.sent.append(
            {
                "user_id": user_id,
                "type": type,
                "title": title,
                "body": body,
                "data": data,
            }
        )
        return f"n{len(self.sent)}"


@dataclass
class SpyEvents:
    published: list[tuple[list[str], str, dict[str, Any]]] = field(default_factory=list)

    async def publish(
        self, user_ids: Iterable[str], type: str, data: dict[str, Any]
    ) -> None:
        self.published.append((sorted(user_ids), type, data))


@dataclass
class FakeMoves:
    """`MoveGateway.get` only, from a dict of snapshots."""

    moves: dict[str, MoveSnapshot] = field(default_factory=dict)

    def get(self, move_id: str) -> MoveSnapshot | None:
        return self.moves.get(move_id)


@dataclass
class SpyMuse:
    """A Muse gateway with the optional `refresh_pseudo_groups` hook."""

    refreshed: list[list[str]] = field(default_factory=list)

    async def refresh_pseudo_groups(self, user_ids: list[str]) -> None:
        self.refreshed.append(sorted(user_ids))


@dataclass
class HookSpy:
    calls: list[tuple[Any, ...]] = field(default_factory=list)

    async def __call__(self, *args: Any) -> None:
        self.calls.append(args)


class FakeCreator:
    """`PlaceCreator`: records the Marks it was asked to create."""

    def __init__(self) -> None:
        self.created: list[tuple[str, Any]] = []
        self.fail = False

    def create(self, user_id: str, place: Any) -> MarkSnapshot:
        if self.fail:
            raise RuntimeError("core down")
        self.created.append((user_id, place))
        return mark(f"new-{len(self.created)}", place.name)
