"""Row builders for core-lane tests: fresh data per test, never the seed.

Each builder adds rows to the session without committing, so a test can build
a whole world and commit once.
"""

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlmodel import Session

from app.ports import Category
from app.tables import Block, Circle, CircleMember, Friendship, Mark, User, UserSettings

T0 = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)


def add_user(
    session: Session,
    user_id: str,
    *,
    verified: bool = False,
    ghost_visible: bool = True,
    home_area: str = "",
) -> str:
    """A user named after its id, with settings."""
    name = user_id.title()
    session.add(
        User(
            id=user_id,
            name=f"{name} Test",
            first_name=name,
            fb_verified=verified,
            home_area=home_area,
            created_at=T0,
        )
    )
    session.add(UserSettings(user_id=user_id, ghost_visible=ghost_visible))
    return user_id


def add_users(
    session: Session, user_ids: Iterable[str], *, verified: Iterable[str] = ()
) -> None:
    verified_ids = set(verified)
    for user_id in user_ids:
        add_user(session, user_id, verified=user_id in verified_ids)


def add_friends(session: Session, user_id: str, *others: str) -> None:
    """Friendships between `user_id` and each of `others` (stored a < b)."""
    for other in others:
        a, b = sorted((user_id, other))
        session.add(Friendship(user_a=a, user_b=b, since=T0))


def add_circle(session: Session, circle_id: str, owner_id: str, *members: str) -> str:
    session.add(Circle(id=circle_id, owner_id=owner_id, name=circle_id.title()))
    session.add_all(CircleMember(circle_id=circle_id, user_id=m) for m in members)
    return circle_id


def add_block(session: Session, user_id: str, hidden_from_user_id: str) -> None:
    """`user_id`'s Moves are never shown to `hidden_from_user_id`."""
    session.add(Block(user_id=user_id, hidden_from_user_id=hidden_from_user_id))


def add_mark(
    session: Session,
    mark_id: str,
    lat: float,
    lng: float,
    *,
    category: Category = "coffee",
) -> str:
    session.add(
        Mark(
            id=mark_id,
            name=mark_id.title(),
            category=category,
            lat=lat,
            lng=lng,
            address=f"1 {mark_id.title()} St",
        )
    )
    return mark_id
