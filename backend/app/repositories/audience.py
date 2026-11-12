"""Storage side of privacy: Circles, blocks and `move_audience` (core C2).

`SqlAudienceRepository` reads what `domain.privacy` needs and writes a
resolved audience. `visible_to` is the SQL twin of `domain.privacy.can_see`
for list queries (C3): every Move-returning query filters with it, so the
rule lives in this module and the domain only.

Writes are added to the session but never committed; the caller commits them
in the same transaction as the Move.
"""

from collections.abc import Collection, Iterable
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import ColumnElement, and_, exists, or_
from sqlmodel import Session, col, select

from app.domain.privacy import MoveVisibility, ResolvedAudience
from app.tables import (
    Block,
    Circle,
    CircleMember,
    Move,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    User,
)


@dataclass(frozen=True, slots=True)
class CircleMembers:
    id: str
    name: str
    member_ids: tuple[str, ...]


class AudienceRepository(Protocol):
    def owned_circles(
        self, owner_id: str, circle_ids: Iterable[str]
    ) -> list[CircleMembers]: ...

    def hidden_from(self, user_id: str) -> frozenset[str]: ...

    def existing_user_ids(self, user_ids: Iterable[str]) -> frozenset[str]: ...

    def users(self, user_ids: Collection[str]) -> list[User]: ...

    def move_visibility(self, move_id: str) -> MoveVisibility | None: ...

    def save(self, move_id: str, audience: ResolvedAudience) -> None: ...


def visible_to(viewer_id: str) -> ColumnElement[bool]:
    """A `WHERE` clause on `moves` matching exactly the Moves `can_see` allows.

    Usage: `select(Move).where(visible_to(viewer_id), Move.status == "live")`.
    """
    is_participant = exists().where(
        MoveParticipant.move_id == Move.id, MoveParticipant.user_id == viewer_id
    )
    in_audience = exists().where(
        MoveAudience.move_id == Move.id, MoveAudience.user_id == viewer_id
    )
    blocked = exists().where(
        Block.user_id == Move.creator_id, Block.hidden_from_user_id == viewer_id
    )
    return or_(
        Move.creator_id == viewer_id,
        and_(or_(is_participant, in_audience), ~blocked),
    )


class SqlAudienceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def owned_circles(
        self, owner_id: str, circle_ids: Iterable[str]
    ) -> list[CircleMembers]:
        """The Circles among `circle_ids` that `owner_id` owns, in the order
        given, deduplicated. Unknown or foreign ids are dropped."""
        wanted = list(dict.fromkeys(circle_ids))
        circles = self.session.exec(
            select(Circle).where(
                Circle.owner_id == owner_id, col(Circle.id).in_(wanted)
            )
        ).all()
        members: dict[str, list[str]] = {circle.id: [] for circle in circles}
        rows = self.session.exec(
            select(CircleMember)
            .where(col(CircleMember.circle_id).in_(members))
            .order_by(col(CircleMember.user_id))
        ).all()
        for row in rows:
            members[row.circle_id].append(row.user_id)
        names = {circle.id: circle.name for circle in circles}
        return [
            CircleMembers(id=cid, name=names[cid], member_ids=tuple(members[cid]))
            for cid in wanted
            if cid in names
        ]

    def hidden_from(self, user_id: str) -> frozenset[str]:
        """Users `user_id` has blocked from seeing their Moves."""
        rows = self.session.exec(
            select(Block.hidden_from_user_id).where(Block.user_id == user_id)
        ).all()
        return frozenset(rows)

    def existing_user_ids(self, user_ids: Iterable[str]) -> frozenset[str]:
        rows = self.session.exec(
            select(User.id).where(col(User.id).in_(set(user_ids)))
        ).all()
        return frozenset(rows)

    def users(self, user_ids: Collection[str]) -> list[User]:
        """Users by id, ordered by name then id."""
        return list(
            self.session.exec(
                select(User)
                .where(col(User.id).in_(user_ids))
                .order_by(col(User.name), col(User.id))
            ).all()
        )

    def move_visibility(self, move_id: str) -> MoveVisibility | None:
        move = self.session.get(Move, move_id)
        if move is None:
            return None
        audience = self.session.exec(
            select(MoveAudience.user_id).where(MoveAudience.move_id == move_id)
        ).all()
        participants = self.session.exec(
            select(MoveParticipant.user_id).where(MoveParticipant.move_id == move_id)
        ).all()
        return MoveVisibility(
            creator_id=move.creator_id,
            audience_ids=frozenset(audience),
            participant_ids=frozenset(participants),
            hidden_from_ids=self.hidden_from(move.creator_id),
        )

    def save(self, move_id: str, audience: ResolvedAudience) -> None:
        """Write `move_audience` and `move_audience_circles` rows (no commit)."""
        self.session.add_all(
            MoveAudience(move_id=move_id, user_id=user_id, via=via)
            for user_id, via in audience.via.items()
        )
        self.session.add_all(
            MoveAudienceCircle(move_id=move_id, circle_id=circle_id)
            for circle_id in audience.circle_ids
        )
