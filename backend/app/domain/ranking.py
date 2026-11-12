"""Pairwise ranking domain (surfaces lane, S6).

Pure and stdlib-only. Beli-style rating: the user picks a face (Loved / Fine /
Not for us), answers a few "this one or that one?" questions against Marks
already in their ranked list, and the ordered list plus a 0 to 10 score per
Mark are derived.

The team has its own ranking algorithm and will supply it. Until then this is a
placeholder behind the two functions the rest of the app depends on
(ARCHITECTURE.md 13.1): `next_comparison` and `apply`. Swap the bodies, keep
the signatures.

Placeholder rules:
  * The ranked list is ordered best first.
  * The new Mark is placed by binary insertion: each answer halves the range.
  * Scores are evenly spaced over the whole list from 10.0 (best) to 0.0
    (worst), so they strictly decrease down the list.
  * The face limits where the new Mark may land: its resulting score must fall
    inside the face's band. If the answers disagree with the face, the face
    wins (the position is clamped into the band).
  * A tie answer (`preferred=None`) places the new Mark just below the tied one.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Face(StrEnum):
    LOVED = "loved"
    FINE = "fine"
    NOT_FOR_US = "not_for_us"


# Inclusive (low, high) score band per face. Bands do not overlap, so ordering
# across faces stays consistent with ordering in the list.
BANDS: dict[Face, tuple[float, float]] = {
    Face.LOVED: (7.0, 10.0),
    Face.FINE: (4.0, 6.9),
    Face.NOT_FOR_US: (0.0, 3.9),
}

MAX_SCORE = 10.0


@dataclass(frozen=True)
class Comparison:
    """One answered question: `other` was shown, `preferred` was chosen.

    `preferred` is the new Mark, `other`, or None for "about the same".
    """

    other: str
    preferred: str | None


def next_comparison(
    ranked: list[str], new_mark: str, answers: list[Comparison]
) -> str | None:
    """Return the Mark to ask about next, or None when the position is settled."""
    lo, hi = _replay(ranked, new_mark, answers)
    if lo >= hi:
        return None
    return ranked[(lo + hi) // 2]


def apply(
    ranked: list[str], new_mark: str, face: Face, answers: list[Comparison]
) -> list[tuple[str, float]]:
    """Insert `new_mark` and return the whole list as (mark, score), best first."""
    lo, hi = _replay(ranked, new_mark, answers)
    index = lo if lo >= hi else (lo + hi) // 2  # unfinished: settle at midpoint
    total = len(ranked) + 1
    index = _clamp_to_band(index, total, face)
    merged = [*ranked[:index], new_mark, *ranked[index:]]
    return list(zip(merged, _spaced_scores(total, face), strict=True))


def _replay(
    ranked: list[str], new_mark: str, answers: list[Comparison]
) -> tuple[int, int]:
    """Replay answers through binary insertion; return the remaining (lo, hi)."""
    if new_mark in ranked:
        raise ValueError(f"{new_mark!r} is already ranked")
    lo, hi = 0, len(ranked)
    for answer in answers:
        if lo >= hi:
            raise ValueError("more answers than comparisons needed")
        mid = (lo + hi) // 2
        if answer.other != ranked[mid]:
            raise ValueError(
                f"answer is about {answer.other!r} but {ranked[mid]!r} was asked"
            )
        if answer.preferred is None:
            lo = hi = mid + 1
        elif answer.preferred == new_mark:
            hi = mid
        elif answer.preferred == answer.other:
            lo = mid + 1
        else:
            raise ValueError(f"preferred {answer.preferred!r} is not in the pair")
    return lo, hi


def _spaced_scores(total: int, face: Face) -> list[float]:
    if total == 1:
        return [BANDS[face][1]]
    step = MAX_SCORE / (total - 1)
    return [MAX_SCORE - i * step for i in range(total)]


def _clamp_to_band(index: int, total: int, face: Face) -> int:
    """Move `index` to the nearest position whose score is inside the face band."""
    low, high = BANDS[face]
    scores = _spaced_scores(total, face)
    allowed = [i for i, s in enumerate(scores) if low <= s <= high]
    if not allowed:  # band falls between two spaced scores: nearest position
        allowed = [min(range(total), key=lambda i: _distance(scores[i], low, high))]
    return min(max(index, allowed[0]), allowed[-1])


def _distance(score: float, low: float, high: float) -> float:
    if score < low:
        return low - score
    if score > high:
        return score - high
    return 0.0
