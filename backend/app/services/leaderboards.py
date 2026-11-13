"""Leaderboard aggregation (surfaces lane, S7).

Only the pure aggregation lives here for now. Reading `mark_rankings` and
friendships, the routes, and category validation (unknown category -> 422) are
added once the T0 contract is merged.

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

DEFAULT_LIMIT = 50


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
