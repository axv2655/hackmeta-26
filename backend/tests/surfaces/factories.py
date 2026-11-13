"""Row builders for surfaces-lane tests: fresh data per test, never the seed.

Each builder adds rows to the session without committing, so a test can build
a whole world and commit once. Other packages may read these; only the
surfaces owner changes them (keep existing signatures).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlmodel import Session

from app.ports import Category, ParticipantStatus
from app.tables import (
    Block,
    Friendship,
    Mark,
    MarkRanking,
    Move,
    MoveAudience,
    MoveParticipant,
    User,
    UserSettings,
)

T0 = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)


def add_user(session: Session, user_id: str) -> str:
    name = user_id.title()
    session.add(User(id=user_id, name=f"{name} Test", first_name=name, created_at=T0))
    session.add(UserSettings(user_id=user_id))
    return user_id


def add_users(session: Session, user_ids: Iterable[str]) -> None:
    for user_id in user_ids:
        add_user(session, user_id)


def add_friends(session: Session, user_id: str, *others: str) -> None:
    for other in others:
        a, b = sorted((user_id, other))
        session.add(Friendship(user_a=a, user_b=b, since=T0))


def add_block(session: Session, user_id: str, hidden_from_user_id: str) -> None:
    """`user_id`'s Moves are never shown to `hidden_from_user_id`."""
    session.add(Block(user_id=user_id, hidden_from_user_id=hidden_from_user_id))


def add_mark(session: Session, mark_id: str, *, category: Category = "coffee") -> str:
    session.add(
        Mark(
            id=mark_id,
            name=mark_id.title(),
            category=category,
            lat=37.48,
            lng=-122.23,
            address=f"1 {mark_id.title()} St",
        )
    )
    return mark_id


def add_move(
    session: Session,
    move_id: str,
    creator_id: str,
    mark_id: str,
    *,
    audience: Iterable[str] = (),
    category: Category = "coffee",
    status: str = "live",
    starts_at: datetime = T0,
    ends_at: datetime | None = None,
) -> str:
    """A Move plus the creator's own participant row (`there` from start)."""
    session.add(
        Move(
            id=move_id,
            creator_id=creator_id,
            mark_id=mark_id,
            text=f"Going to {mark_id}",
            category=category,
            status=status,
            starts_at=starts_at,
            ends_at=ends_at,
            created_at=starts_at,
        )
    )
    session.add_all(MoveAudience(move_id=move_id, user_id=u) for u in audience)
    add_participant(session, move_id, creator_id, arrived_at=starts_at, via="creator")
    return move_id


def add_participant(
    session: Session,
    move_id: str,
    user_id: str,
    *,
    status: ParticipantStatus = "there",
    arrived_at: datetime | None = T0,
    left_at: datetime | None = None,
    via: str = "tap",
) -> None:
    session.add(
        MoveParticipant(
            move_id=move_id,
            user_id=user_id,
            status=status,
            joined_via=via,
            joined_at=arrived_at or T0,
            arrived_at=arrived_at,
            left_at=left_at,
        )
    )


def add_ranking(
    session: Session,
    user_id: str,
    mark_id: str,
    score: float,
    *,
    category: Category = "coffee",
    position: int = 1,
) -> None:
    session.add(
        MarkRanking(
            user_id=user_id,
            mark_id=mark_id,
            category=category,
            position=position,
            score=score,
        )
    )
