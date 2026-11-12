"""Circles: user-defined audiences, managed only by their owner
(ARCHITECTURE.md 1.4, 5.1, 12.2).

A Circle is private to its owner: members are not told they are in one, so
listing returns only the viewer's own Circles. Audience resolution reads
`circle_members` at post time (`services/audience.py`).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, col, delete, select

from app.domain.errors import Forbidden, Invalid, NotFound
from app.services.users import require_users
from app.tables import Circle, CircleMember, User, UserSettings

MAX_NAME_LENGTH = 60
EDITABLE = frozenset({"name", "emoji", "fb_group_name", "member_ids"})


class CircleNotFound(NotFound):
    def __init__(self, circle_id: str) -> None:
        super().__init__(f"Circle {circle_id!r} not found")


class NotCircleOwner(Forbidden):
    def __init__(self, circle_id: str) -> None:
        super().__init__(f"Only the owner can change Circle {circle_id!r}")


@dataclass(frozen=True, slots=True)
class CircleView:
    circle: Circle
    members: Sequence[User]


def clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise Invalid("A Circle needs a name")
    if len(cleaned) > MAX_NAME_LENGTH:
        raise Invalid(f"Circle names are at most {MAX_NAME_LENGTH} characters")
    return cleaned


class CircleService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_owned(self, owner_id: str) -> list[CircleView]:
        circles = self._session.exec(
            select(Circle).where(Circle.owner_id == owner_id).order_by(col(Circle.name))
        )
        return [self._view(circle) for circle in circles]

    def create(
        self,
        owner_id: str,
        name: str,
        member_ids: Iterable[str] = (),
        *,
        emoji: str = "",
        fb_group_name: str | None = None,
    ) -> CircleView:
        circle = Circle(
            owner_id=owner_id,
            name=clean_name(name),
            emoji=emoji,
            fb_group_name=fb_group_name,
        )
        members = require_users(self._session, member_ids, not_self=owner_id)
        self._session.add(circle)
        self._add_members(circle.id, members)
        self._session.commit()
        return self._view(circle)

    def update(
        self, owner_id: str, circle_id: str, changes: Mapping[str, Any]
    ) -> CircleView:
        """Apply only the keys present in `changes` (any of `EDITABLE`);
        `member_ids` replaces the whole member set."""
        if unknown := set(changes) - EDITABLE:
            raise Invalid(f"Cannot change: {', '.join(sorted(unknown))}")
        if nulled := {k for k, v in changes.items() if v is None} - {"fb_group_name"}:
            raise Invalid(f"Cannot clear: {', '.join(sorted(nulled))}")
        circle = self._owned(owner_id, circle_id)
        if "name" in changes:
            circle.name = clean_name(changes["name"])
        if "emoji" in changes:
            circle.emoji = changes["emoji"]
        if "fb_group_name" in changes:
            circle.fb_group_name = changes["fb_group_name"]
        if "member_ids" in changes:
            members = require_users(
                self._session, changes["member_ids"], not_self=owner_id
            )
            self._clear_members(circle_id)
            self._add_members(circle_id, members)
        self._session.add(circle)
        self._session.commit()
        return self._view(circle)

    def delete(self, owner_id: str, circle_id: str) -> None:
        """Also drops it from the owner's default Circles. Past Moves keep
        their resolved `move_audience`, so nobody gains or loses access."""
        circle = self._owned(owner_id, circle_id)
        self._clear_members(circle_id)
        settings = self._session.get(UserSettings, owner_id)
        if settings is not None and circle_id in settings.default_circle_ids:
            settings.default_circle_ids = [
                cid for cid in settings.default_circle_ids if cid != circle_id
            ]
            self._session.add(settings)
        self._session.delete(circle)
        self._session.commit()

    def _owned(self, owner_id: str, circle_id: str) -> Circle:
        circle = self._session.get(Circle, circle_id)
        if circle is None:
            raise CircleNotFound(circle_id)
        if circle.owner_id != owner_id:
            raise NotCircleOwner(circle_id)
        return circle

    def _add_members(self, circle_id: str, members: Iterable[User]) -> None:
        self._session.add_all(
            CircleMember(circle_id=circle_id, user_id=user.id) for user in members
        )

    def _clear_members(self, circle_id: str) -> None:
        self._session.exec(
            delete(CircleMember).where(col(CircleMember.circle_id) == circle_id)
        )

    def _view(self, circle: Circle) -> CircleView:
        members = self._session.exec(
            select(User)
            .join(CircleMember, col(CircleMember.user_id) == col(User.id))
            .where(CircleMember.circle_id == circle.id)
            .order_by(col(User.name))
        ).all()
        return CircleView(circle=circle, members=members)
