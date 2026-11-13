"""Circles: user-defined audiences, managed only by their owner
(ARCHITECTURE.md 1.4, 5.1, 12.2).

Members must be the owner's friends (`NotAFriend`, a 422). A Circle is
private to its owner: members are not told they are in one, so
listing returns only the viewer's own Circles. Audience resolution reads
`circle_members` at post time (`services/audience.py`).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from app.domain.errors import Forbidden, Invalid, NotFound
from app.domain.records import Circle, User
from app.repositories.unit_of_work import CoreUnitOfWork
from app.services.users import require_friends, require_users

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
    def __init__(self, uow: CoreUnitOfWork) -> None:
        self.uow = uow
        self.repo = uow.circles

    def list_owned(self, owner_id: str) -> list[CircleView]:
        circles = self.repo.list_owned(owner_id)
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
        members = self._friends(owner_id, member_ids)
        self.repo.put(circle)
        self._add_members(circle.id, members)
        self.uow.commit()
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
            circle = replace(circle, name=clean_name(changes["name"]))
        if "emoji" in changes:
            circle = replace(circle, emoji=changes["emoji"])
        if "fb_group_name" in changes:
            circle = replace(circle, fb_group_name=changes["fb_group_name"])
        if "member_ids" in changes:
            members = self._friends(owner_id, changes["member_ids"])
        try:
            if "member_ids" in changes:
                self._add_members(circle_id, members)
            self.repo.put(circle)
            self.uow.commit()
        except Exception:
            self.uow.rollback()
            raise
        return self._view(circle)

    def delete(self, owner_id: str, circle_id: str) -> None:
        """Also drops it from the owner's default Circles. Past Moves keep
        their resolved `move_audience`, so nobody gains or loses access."""
        circle = self._owned(owner_id, circle_id)
        self._clear_members(circle_id)
        settings = self.uow.users.get_settings(owner_id)
        if settings is not None and circle_id in settings.default_circle_ids:
            settings = replace(
                settings,
                default_circle_ids=[
                    cid for cid in settings.default_circle_ids if cid != circle_id
                ],
            )
            self.uow.users.put_settings(settings)
        self.repo.delete(circle.id)
        self.uow.commit()

    def _owned(self, owner_id: str, circle_id: str) -> Circle:
        circle = self.repo.get(circle_id)
        if circle is None:
            raise CircleNotFound(circle_id)
        if circle.owner_id != owner_id:
            raise NotCircleOwner(circle_id)
        return circle

    def _friends(self, owner_id: str, member_ids: Iterable[str]) -> list[User]:
        """Known users other than the owner, all of them the owner's friends."""
        members = require_users(self.uow.users, member_ids, not_self=owner_id)
        require_friends(self.uow.users, owner_id, [user.id for user in members])
        return members

    def _add_members(self, circle_id: str, members: Iterable[User]) -> None:
        self.repo.replace_members(circle_id, [user.id for user in members])

    def _clear_members(self, circle_id: str) -> None:
        self.repo.replace_members(circle_id, [])

    def _view(self, circle: Circle) -> CircleView:
        return CircleView(circle=circle, members=self.repo.members(circle.id))
