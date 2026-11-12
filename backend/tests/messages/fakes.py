"""Fakes for messages-lane tests. Other lanes' ports are faked here, never
imported from their test packages (tests/contract/test_lane_isolation.py)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta

from sqlmodel import Session

from app.ports import MarkSnapshot, MoveSnapshot, NotificationType, ParticipantSnapshot
from app.tables import Mark, Move, User

T0 = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)

KUMO = MarkSnapshot(
    id="kumo",
    name="Kumo Matcha",
    category="coffee",
    lat=32.99,
    lng=-96.74,
    address="1 Main St, Richardson",
    photo_url="https://example.com/kumo.jpg",
)


class FixedClock:
    def __init__(self, now: datetime = T0) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)


@dataclass
class FakeMoves:
    """`MoveGateway.get` and `audience_ids` over a dict."""

    moves: dict[str, MoveSnapshot] = field(default_factory=dict)
    audiences: dict[str, frozenset[str]] = field(default_factory=dict)

    def get(self, move_id: str) -> MoveSnapshot | None:
        return self.moves.get(move_id)

    def audience_ids(self, move_id: str) -> frozenset[str]:
        return self.audiences.get(move_id, frozenset())

    def end(self, move_id: str) -> None:
        self.moves[move_id] = replace(self.moves[move_id], status="ended")


@dataclass
class RecordingNotifier:
    sent: list[tuple[str, NotificationType, str, str, dict[str, str]]] = field(
        default_factory=list
    )

    async def send(
        self,
        user_id: str,
        type: NotificationType,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> str:
        self.sent.append((user_id, type, title, body, data))
        return f"n{len(self.sent)}"


def participant(user_id: str, status: str = "there") -> ParticipantSnapshot:
    return ParticipantSnapshot(
        user_id=user_id, status=status, joined_via="tap", joined_at=T0
    )


def kumo_move(
    move_id: str = "m1",
    creator: str = "ana",
    participants: Iterable[str] = ("ana",),
) -> MoveSnapshot:
    return MoveSnapshot(
        id=move_id,
        creator_id=creator,
        mark=KUMO,
        text="matcha + PSET",
        category="coffee",
        status="live",
        kind="move",
        open=False,
        origin="manual",
        starts_at=T0 - timedelta(minutes=12),
        created_at=T0 - timedelta(minutes=12),
        participants=tuple(participant(u) for u in participants),
    )


def add_world(session: Session, users: Iterable[str] = ("ana", "bo", "dee")) -> None:
    """Rows the invite table's foreign keys point at."""
    for user_id in users:
        session.add(
            User(
                id=user_id,
                name=f"{user_id.title()} X",
                first_name=user_id.title(),
                created_at=T0,
            )
        )
    session.add(
        Mark(id="kumo", name="Kumo Matcha", category="coffee", lat=32.99, lng=-96.74)
    )
    session.add(
        Move(
            id="m1",
            creator_id="ana",
            mark_id="kumo",
            text="matcha + PSET",
            category="coffee",
            starts_at=T0,
            created_at=T0,
        )
    )
    session.commit()
