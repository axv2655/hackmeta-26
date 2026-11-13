"""SQL reads and writes for ratings and per-user ranked lists (surfaces S6, S7).

Writes only `ratings` and `mark_rankings`. Reads Marks, users, friendships,
blocks and taste profiles. The caller commits.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence

from sqlmodel import Session, col, delete, or_, select

from app.tables import (
    Block,
    Friendship,
    Mark,
    MarkRanking,
    Rating,
    TasteProfile,
    User,
)


class SqlRatingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- Ranked lists --------------------------------------------------------

    def ranked(self, user_id: str, category: str) -> list[MarkRanking]:
        """The user's list for one category, best first."""
        return list(
            self.session.exec(
                select(MarkRanking)
                .where(MarkRanking.user_id == user_id, MarkRanking.category == category)
                .order_by(col(MarkRanking.score).desc(), col(MarkRanking.mark_id))
            )
        )

    def replace_ranked(
        self, user_id: str, category: str, items: Sequence[tuple[str, float]]
    ) -> None:
        """Rewrite the user's list for `category` as `items` (best first)."""
        mark_ids = [mark_id for mark_id, _ in items]
        self.session.exec(  # type: ignore[call-overload]
            delete(MarkRanking).where(
                col(MarkRanking.user_id) == user_id,
                or_(
                    col(MarkRanking.category) == category,
                    col(MarkRanking.mark_id).in_(mark_ids),
                ),
            )
        )
        self.session.add_all(
            MarkRanking(
                user_id=user_id,
                mark_id=mark_id,
                category=category,
                position=position,
                score=score,
            )
            for position, (mark_id, score) in enumerate(items, start=1)
        )

    def rankings_of(
        self, user_ids: Collection[str], category: str | None
    ) -> list[MarkRanking]:
        if not user_ids:
            return []
        stmt = select(MarkRanking).where(col(MarkRanking.user_id).in_(user_ids))
        if category is not None:
            stmt = stmt.where(MarkRanking.category == category)
        return list(self.session.exec(stmt))

    # --- Ratings -------------------------------------------------------------

    def has_rating(self, move_id: str, user_id: str) -> bool:
        stmt = select(Rating).where(
            Rating.move_id == move_id, Rating.user_id == user_id
        )
        return self.session.exec(stmt).first() is not None

    def add_rating(self, rating: Rating) -> None:
        self.session.add(rating)

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    # --- Lookups -------------------------------------------------------------

    def marks(self, mark_ids: Iterable[str]) -> dict[str, Mark]:
        ids = list(set(mark_ids))
        if not ids:
            return {}
        rows = self.session.exec(select(Mark).where(col(Mark.id).in_(ids)))
        return {m.id: m for m in rows}

    def users(self, user_ids: Iterable[str]) -> dict[str, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = self.session.exec(select(User).where(col(User.id).in_(ids)))
        return {u.id: u for u in rows}

    def friend_ids(self, user_id: str) -> frozenset[str]:
        rows = self.session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
            )
        )
        return frozenset(r.user_b if r.user_a == user_id else r.user_a for r in rows)

    def blocked_either_way(self, user_id: str) -> frozenset[str]:
        rows = self.session.exec(
            select(Block).where(
                or_(Block.user_id == user_id, Block.hidden_from_user_id == user_id)
            )
        )
        return frozenset(
            r.hidden_from_user_id if r.user_id == user_id else r.user_id for r in rows
        )

    def taste(self, user_id: str) -> TasteProfile | None:
        self.session.expire_all()
        return self.session.exec(
            select(TasteProfile).where(
                TasteProfile.subject_type == "user", TasteProfile.subject_id == user_id
            )
        ).first()
