"""Storage for Marks and Saved Marks, plus the reads a Mark page needs (core C6).

`SqlMarkRepository` reads and writes `marks` and `saved_marks`, and reads (never
writes) the rows a Mark page is built from: ghost candidates, Moments, Move
counts, rankings, friendships and saved Reels. It holds no business rules: the
ghost window, distances and scoring live in `app.services.marks`.

Visibility: every read that touches Moves (`ghost_candidates`, `moments`,
`moves_count`) filters with `repositories.audience.visible_to`, so a Mark page
never reveals a Move its viewer may not see.

Writes are flushed and committed by the caller (the service).
"""

from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import and_, case, exists, func, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, select

from app.ports import Category, MarkSnapshot, MoveStatus, ParticipantStatus
from app.repositories.audience import visible_to
from app.repositories.moves import mark_snapshot
from app.repositories.records import record, store
from app.tables import (
    Block,
    Friendship,
    Mark,
    MarkRanking,
    Moment,
    Move,
    MoveParticipant,
    Reel,
    SavedMark,
    SavedReel,
    User,
    UserSettings,
)


@dataclass(frozen=True, slots=True)
class Box:
    """A lat/lng bounding box, inclusive on every side."""

    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float


@dataclass(frozen=True, slots=True)
class GhostCandidate:
    """A participant of a visible Move who may have left a ghost at its Mark."""

    mark_id: str
    move_id: str
    user_id: str
    status: ParticipantStatus
    left_at: datetime | None
    move_status: MoveStatus
    ends_at: datetime | None


@dataclass(frozen=True, slots=True)
class Ranking:
    user_id: str
    mark_id: str
    score: float


@dataclass(frozen=True, slots=True)
class NewMark:
    name: str
    category: Category
    lat: float
    lng: float
    address: str
    photo_url: str | None
    price_level: int | None
    vibe_tags: tuple[str, ...]
    created_by: str


class MarkRepository(Protocol):
    """What the Mark service needs from storage. Fake this in service tests."""

    def get(self, mark_id: str) -> MarkSnapshot | None: ...

    def within(self, box: Box | None) -> list[MarkSnapshot]: ...

    def search(self, query: str, limit: int) -> list[MarkSnapshot]: ...

    def create(self, new: NewMark) -> MarkSnapshot: ...

    def saved_row(self, user_id: str, mark_id: str) -> SavedMark | None: ...

    def saved_ids(self, user_id: str, mark_ids: Collection[str]) -> frozenset[str]: ...

    def saved_marks(self, user_id: str) -> list[tuple[SavedMark, MarkSnapshot]]: ...

    def saved_reels(self, user_id: str) -> list[tuple[SavedReel, Reel]]: ...

    def put_saved(self, row: SavedMark) -> None: ...

    def delete_saved(self, user_id: str, mark_id: str) -> None: ...

    def ghost_candidates(
        self, viewer_id: str, mark_ids: Collection[str], since: datetime
    ) -> list[GhostCandidate]: ...

    def moments(self, viewer_id: str, mark_id: str, limit: int) -> list[Moment]: ...

    def moves_count(self, viewer_id: str, mark_id: str) -> int: ...

    def friend_ids(self, user_id: str) -> frozenset[str]: ...

    def rankings(
        self, mark_ids: Collection[str], user_ids: Collection[str]
    ) -> list[Ranking]: ...

    def users(self, user_ids: Iterable[str]) -> dict[str, User]: ...

    def commit(self) -> None: ...


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class SqlMarkRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- Marks ---------------------------------------------------------------

    def get(self, mark_id: str) -> MarkSnapshot | None:
        mark = self.session.get(Mark, mark_id)
        return None if mark is None else mark_snapshot(mark)

    def within(self, box: Box | None) -> list[MarkSnapshot]:
        """Marks inside `box` (every Mark when None), in id order."""
        query = select(Mark).order_by(col(Mark.id))
        if box is not None:
            query = query.where(
                col(Mark.lat).between(box.min_lat, box.max_lat),
                col(Mark.lng).between(box.min_lng, box.max_lng),
            )
        return [mark_snapshot(mark) for mark in self.session.exec(query)]

    def search(self, query: str, limit: int) -> list[MarkSnapshot]:
        """Marks whose name contains `query` (case-insensitive), names that
        start with it first, then alphabetical."""
        text = _escape_like(query)
        name = col(Mark.name)
        prefix_first = case((name.ilike(f"{text}%", escape="\\"), 0), else_=1)
        rows = self.session.exec(
            select(Mark)
            .where(name.ilike(f"%{text}%", escape="\\"))
            .order_by(prefix_first, func.lower(name), col(Mark.id))
            .limit(limit)
        )
        return [mark_snapshot(mark) for mark in rows]

    def create(self, new: NewMark) -> MarkSnapshot:
        mark = Mark(
            name=new.name,
            category=new.category,
            lat=new.lat,
            lng=new.lng,
            address=new.address,
            photo_url=new.photo_url,
            price_level=new.price_level,
            vibe_tags=list(new.vibe_tags),
            source="user",
            created_by=new.created_by,
        )
        self.session.add(mark)
        self.session.flush()
        return mark_snapshot(mark)

    # --- Saved Marks and Reels -----------------------------------------------

    def saved_row(self, user_id: str, mark_id: str) -> SavedMark | None:
        return record(self.session.get(SavedMark, (user_id, mark_id)))

    def saved_ids(self, user_id: str, mark_ids: Collection[str]) -> frozenset[str]:
        rows = self.session.exec(
            select(SavedMark.mark_id).where(
                SavedMark.user_id == user_id, col(SavedMark.mark_id).in_(mark_ids)
            )
        )
        return frozenset(rows)

    def saved_marks(self, user_id: str) -> list[tuple[SavedMark, MarkSnapshot]]:
        """The user's Saved Marks, most recently saved first."""
        rows = self.session.exec(
            select(SavedMark, Mark)
            .join(Mark, col(Mark.id) == col(SavedMark.mark_id))
            .where(SavedMark.user_id == user_id)
            .order_by(col(SavedMark.saved_at).desc(), col(Mark.id))
        )
        return [(record(saved), mark_snapshot(mark)) for saved, mark in rows]

    def saved_reels(self, user_id: str) -> list[tuple[SavedReel, Reel]]:
        """The user's saved Reels, most recently saved first."""
        rows = self.session.exec(
            select(SavedReel, Reel)
            .join(Reel, col(Reel.id) == col(SavedReel.reel_id))
            .where(SavedReel.user_id == user_id)
            .order_by(col(SavedReel.saved_at).desc(), col(Reel.id))
        )
        return [(record(saved), record(reel)) for saved, reel in rows]

    def put_saved(self, row: SavedMark) -> None:
        store(self.session, row)

    def delete_saved(self, user_id: str, mark_id: str) -> None:
        if row := self.session.get(SavedMark, (user_id, mark_id)):
            self.session.delete(row)
            self.session.flush()

    # --- Moves at a Mark (all filtered by `visible_to`) ----------------------

    def ghost_candidates(
        self, viewer_id: str, mark_ids: Collection[str], since: datetime
    ) -> list[GhostCandidate]:
        """Participants who were `there` or `left` in a live or ended Move at
        one of `mark_ids` that `viewer_id` may see, with `left_at` or the
        Move's `ends_at` at or after `since`.

        Already excluded: the viewer, users with `ghost_visible` off, and
        users who hide their Moves from the viewer.
        """
        if not mark_ids:
            return []
        # Aliased so `visible_to`'s own participant subquery stays uncorrelated.
        p = aliased(MoveParticipant)
        ghost_hidden = exists().where(
            UserSettings.user_id == p.user_id,
            col(UserSettings.ghost_visible).is_(False),
        )
        blocks_viewer = exists().where(
            Block.user_id == p.user_id, Block.hidden_from_user_id == viewer_id
        )
        rows = self.session.exec(
            select(Move, p)
            .join(p, col(p.move_id) == col(Move.id))
            .where(
                col(Move.mark_id).in_(mark_ids),
                col(Move.status).in_(("live", "ended")),
                col(p.status).in_(("there", "left")),
                p.user_id != viewer_id,
                or_(
                    and_(p.status == "left", col(p.left_at) >= since),
                    and_(Move.status == "ended", col(Move.ends_at) >= since),
                ),
                visible_to(viewer_id),
                ~ghost_hidden,
                ~blocks_viewer,
            )
            .order_by(col(Move.id), col(p.user_id))
        )
        return [
            GhostCandidate(
                mark_id=move.mark_id,
                move_id=move.id,
                user_id=part.user_id,
                status=part.status,
                left_at=part.left_at,
                move_status=move.status,
                ends_at=move.ends_at,
            )
            for move, part in rows
        ]

    def moments(self, viewer_id: str, mark_id: str, limit: int) -> list[Moment]:
        """Newest Moments at the Mark the viewer may see: from a visible Move,
        and approved unless the viewer was in that Move (7.4)."""
        in_move = exists().where(
            MoveParticipant.move_id == Moment.move_id,
            MoveParticipant.user_id == viewer_id,
        )
        rows = self.session.exec(
            select(Moment)
            .join(Move, col(Move.id) == col(Moment.move_id))
            .where(
                Moment.mark_id == mark_id,
                visible_to(viewer_id),
                or_(
                    Moment.status == "approved",
                    Moment.author_id == viewer_id,
                    Move.creator_id == viewer_id,
                    in_move,
                ),
            )
            .order_by(col(Moment.created_at).desc(), col(Moment.id))
            .limit(limit)
        )
        return [record(row) for row in rows]

    def moves_count(self, viewer_id: str, mark_id: str) -> int:
        """Live or ended Moves at the Mark that the viewer may see."""
        return self.session.exec(
            select(func.count())
            .select_from(Move)
            .where(
                Move.mark_id == mark_id,
                col(Move.status).in_(("live", "ended")),
                visible_to(viewer_id),
            )
        ).one()

    # --- People and rankings -------------------------------------------------

    def friend_ids(self, user_id: str) -> frozenset[str]:
        rows = self.session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
            )
        )
        return frozenset(r.user_b if r.user_a == user_id else r.user_a for r in rows)

    def rankings(
        self, mark_ids: Collection[str], user_ids: Collection[str]
    ) -> list[Ranking]:
        if not mark_ids or not user_ids:
            return []
        rows = self.session.exec(
            select(MarkRanking).where(
                col(MarkRanking.mark_id).in_(mark_ids),
                col(MarkRanking.user_id).in_(user_ids),
            )
        )
        return [Ranking(r.user_id, r.mark_id, r.score) for r in rows]

    def users(self, user_ids: Iterable[str]) -> dict[str, User]:
        ids = set(user_ids)
        if not ids:
            return {}
        rows = self.session.exec(select(User).where(col(User.id).in_(ids)))
        return {user.id: record(user) for user in rows}

    def commit(self) -> None:
        self.session.commit()
