"""A small friend graph for the social tests (helpers live here, not in the
shared factories).

    ana - bo, ana - cy, bo - dee, cy - dee, bo - eve
    fay, gus, hal, ian: nobody's friends

So for ana, dee is a friend of a friend with 2 mutual friends (bo, cy), eve
has 1 (bo), and fay, gus, hal, ian are strangers.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlmodel import Session

from app.tables import (
    Credential,
    Friendship,
    Mark,
    Move,
    MoveAudience,
    MoveParticipant,
    User,
)

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)
PEOPLE = {
    "ana": "Ana Lopez",
    "bo": "Bo Chen",
    "cy": "Cy Park",
    "dee": "Dee Rao",
    "eve": "Eve Kim",
    "fay": "Fay Ito",
    "gus": "Gus Moe",
    "hal": "Hal Roy",
    "ian": "Ian Fox",
}
FRIENDS = [("ana", "bo"), ("ana", "cy"), ("bo", "dee"), ("cy", "dee"), ("bo", "eve")]


class Clock:
    def now(self) -> datetime:
        return NOW


class Inbox:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, dict[str, str]]] = []

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: Any
    ) -> str:
        self.sent.append((user_id, type, dict(data)))
        return "n1"


def befriend(session: Session, a: str, b: str) -> None:
    low, high = sorted((a, b))
    session.add(Friendship(user_a=low, user_b=high, since=NOW - timedelta(days=30)))


def build(session: Session) -> None:
    for uid, name in PEOPLE.items():
        session.add(User(id=uid, name=name, first_name=name.split()[0], created_at=NOW))
    session.flush()
    session.add(
        Credential(user_id="dee", username="deerao", password_hash="x", created_at=NOW)
    )
    for a, b in FRIENDS:
        befriend(session, a, b)
    session.commit()


def add_move(
    session: Session,
    move_id: str,
    creator: str,
    audience: tuple[str, ...] = (),
    *,
    status: str = "live",
    joined: tuple[str, ...] = (),
) -> None:
    if session.get(Mark, "mk_kumo") is None:
        session.add(
            Mark(id="mk_kumo", name="Kumo Matcha", category="coffee", lat=1, lng=2)
        )
        session.flush()
    session.add(
        Move(
            id=move_id,
            creator_id=creator,
            mark_id="mk_kumo",
            text=f"{creator} at Kumo",
            category="coffee",
            status=status,
            starts_at=NOW - timedelta(minutes=10),
            created_at=NOW - timedelta(minutes=10),
        )
    )
    session.flush()
    for uid in audience:
        session.add(MoveAudience(move_id=move_id, user_id=uid))
    for uid in (creator, *joined):
        session.add(
            MoveParticipant(
                move_id=move_id,
                user_id=uid,
                status="going",
                joined_via="creator" if uid == creator else "tap",
                joined_at=NOW,
            )
        )
    session.commit()
