"""Leaderboards (surfaces lane, S7): pure aggregation plus `LeaderboardService`.

The service reads `mark_rankings` for the viewer and the viewer's friends
(minus anyone blocked either way) and feeds the pure functions below.
`category` is optional (None = every category); an unknown value is
`UnknownCategory` (422).

Rules (ARCHITECTURE.md 13.2): boards are computed on read, include only the
viewer and the viewer's friends (blocked friends removed by the caller via
`eligible_friends`), so they leak nothing beyond existing audiences. Ties break
by Mark id so ordering is stable. Scores are rounded to one decimal after
ordering. Each (user, Mark) pair is expected to appear once.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from statistics import fmean
from typing import get_args

from pydantic import BaseModel
from sqlmodel import Session

from app.domain.errors import Invalid
from app.muse.schemas import MarkOut, MuseUserLite
from app.ports import Category
from app.repositories.ratings import SqlRatingRepository
from app.tables import MarkRanking

DEFAULT_LIMIT = 50
MAX_RANKERS = 3
CATEGORIES: frozenset[str] = frozenset(get_args(Category))


@dataclass(frozen=True)
class Ranking:
    user_id: str
    mark_id: str
    score: float
    category: str


@dataclass(frozen=True)
class SpotRow:
    mark_id: str
    score: float  # average over the viewer and friends who ranked it
    your_score: float | None
    friends_score: float | None


@dataclass(frozen=True)
class ListRow:
    mark_id: str
    score: float


def eligible_friends(
    friend_ids: Iterable[str], blocked_ids: Iterable[str]
) -> frozenset[str]:
    """Friends minus anyone blocked (either direction, resolved by the caller)."""
    return frozenset(friend_ids) - frozenset(blocked_ids)


def top_spots(
    rankings: Iterable[Ranking],
    viewer_id: str,
    friend_ids: frozenset[str],
    category: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[SpotRow]:
    """Marks ranked by the viewer or friends, best combined score first."""
    mine: dict[str, float] = {}
    friends: dict[str, list[float]] = {}
    for item in _in_category(rankings, category):
        if item.user_id == viewer_id:
            mine[item.mark_id] = item.score
        elif item.user_id in friend_ids:
            friends.setdefault(item.mark_id, []).append(item.score)
    ordered = sorted(
        (
            _spot(mark_id, mine.get(mark_id), friends.get(mark_id, []))
            for mark_id in mine.keys() | friends.keys()
        ),
        key=lambda row: (-row[0], row[1].mark_id),
    )
    return [row for _, row in ordered[:limit]]


def my_list(
    rankings: Iterable[Ranking],
    viewer_id: str,
    category: str | None = None,
) -> list[ListRow]:
    """The viewer's own ranked list, best first."""
    own = [r for r in _in_category(rankings, category) if r.user_id == viewer_id]
    own.sort(key=lambda r: (-r.score, r.mark_id))
    return [ListRow(mark_id=r.mark_id, score=r.score) for r in own]


def _in_category(rankings: Iterable[Ranking], category: str | None) -> list[Ranking]:
    return [r for r in rankings if category is None or r.category == category]


def _spot(
    mark_id: str, your: float | None, friend_scores: list[float]
) -> tuple[float, SpotRow]:
    everyone = ([your] if your is not None else []) + friend_scores
    combined = fmean(everyone)
    row = SpotRow(
        mark_id=mark_id,
        score=round(combined, 1),
        your_score=your,
        friends_score=round(fmean(friend_scores), 1) if friend_scores else None,
    )
    return combined, row


# --- Service -----------------------------------------------------------------


class UnknownCategory(Invalid):
    def __init__(self, category: str) -> None:
        super().__init__(f"unknown category {category}")
        self.category = category


class LeaderboardSpot(BaseModel):
    position: int
    mark: MarkOut
    score: float
    your_score: float | None
    friends_score: float | None
    rankers: list[MuseUserLite]


class MyListRow(BaseModel):
    position: int
    mark: MarkOut
    score: float
    category: Category


def check_category(category: str | None) -> str | None:
    """Blank means every category; anything else must be a known one."""
    if category is None or not category.strip():
        return None
    if category not in CATEGORIES:
        raise UnknownCategory(category)
    return category


def top_rankers(
    rows: Iterable[MarkRanking], mark_id: str, limit: int = MAX_RANKERS
) -> list[str]:
    """User ids who ranked `mark_id`, highest score first (ties by id)."""
    mine = sorted(
        (r for r in rows if r.mark_id == mark_id), key=lambda r: (-r.score, r.user_id)
    )
    return [r.user_id for r in mine[:limit]]


class LeaderboardService:
    def __init__(self, session: Session) -> None:
        self.repo = SqlRatingRepository(session)

    def spots(
        self, viewer_id: str, category: str | None, limit: int = DEFAULT_LIMIT
    ) -> list[LeaderboardSpot]:
        category = check_category(category)
        friends = eligible_friends(
            self.repo.friend_ids(viewer_id), self.repo.blocked_either_way(viewer_id)
        )
        rows = self.repo.rankings_of({viewer_id, *friends}, category)
        spots = top_spots(_as_rankings(rows), viewer_id, friends, None, limit)
        marks = self.repo.marks(s.mark_id for s in spots)
        rankers = {s.mark_id: top_rankers(rows, s.mark_id) for s in spots}
        users = self.repo.users(u for ids in rankers.values() for u in ids)
        return [
            LeaderboardSpot(
                position=i,
                mark=MarkOut.of(marks[s.mark_id]),
                score=s.score,
                your_score=s.your_score,
                friends_score=s.friends_score,
                rankers=[
                    MuseUserLite.of(users[u]) for u in rankers[s.mark_id] if u in users
                ],
            )
            for i, s in enumerate((s for s in spots if s.mark_id in marks), 1)
        ]

    def my_list(self, viewer_id: str, category: str | None) -> list[MyListRow]:
        category = check_category(category)
        rows = self.repo.rankings_of({viewer_id}, category)
        listed = my_list(_as_rankings(rows), viewer_id)
        marks = self.repo.marks(r.mark_id for r in listed)
        return [
            MyListRow(
                position=i,
                mark=MarkOut.of(marks[r.mark_id]),
                score=r.score,
                category=marks[r.mark_id].category,
            )
            for i, r in enumerate((r for r in listed if r.mark_id in marks), 1)
        ]


def _as_rankings(rows: Iterable[MarkRanking]) -> list[Ranking]:
    return [Ranking(r.user_id, r.mark_id, r.score, r.category) for r in rows]
