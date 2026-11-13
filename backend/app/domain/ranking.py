"""Pairwise ranking domain (surfaces lane, S6).

Pure and stdlib-only. Beli-style rating: the user picks a face (Loved / Fine /
Not for us), answers a few "this one or that one?" questions against Marks
already in their ranked list, and the ordered list plus a 0 to 10 score per
Mark are derived. The rest of the app depends only on `next_comparison` and
`apply` (ARCHITECTURE.md 13.1).

Rules:
  * The ranked list is ordered best first.
  * The new Mark is placed by binary insertion over the whole list: each
    answer halves the range. A tie (`preferred=None`, the "about the same"
    answer) places the new Mark just below the tied one.
  * Every Mark has a face. Existing Marks get theirs from their current score
    band (`scores`); a Mark with no known score shares the new Mark's face.
  * The face wins over the answers: the new Mark is clamped into the stretch
    of the list that holds its face, so faces stay grouped
    Loved > Fine > Not for us.
  * Scores are spread evenly inside each face band among the Marks of that
    face, best at the top of the band. So every score stays inside its face
    band, and scores strictly decrease down the list.
  * Answers that do not replay (about a Mark that was not asked, more answers
    than needed, a choice outside the pair) raise `StaleComparison`.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum

from app.domain.errors import Invalid


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

FACE_ORDER: tuple[Face, ...] = (Face.LOVED, Face.FINE, Face.NOT_FOR_US)

MAX_SCORE = 10.0


class StaleComparison(Invalid):
    """The answers do not match the questions this list would ask."""


class AlreadyRanked(Invalid):
    """The new Mark is already in the list it is being inserted into."""

    def __init__(self, mark_id: str) -> None:
        super().__init__(f"{mark_id} is already ranked")
        self.mark_id = mark_id


@dataclass(frozen=True)
class Comparison:
    """One answered question: `other` was shown, `preferred` was chosen.

    `preferred` is the new Mark, `other`, or None for "about the same".
    """

    other: str
    preferred: str | None


def face_for(score: float) -> Face:
    """The face whose band holds `score` (gaps between bands round down)."""
    if score >= BANDS[Face.LOVED][0]:
        return Face.LOVED
    if score >= BANDS[Face.FINE][0]:
        return Face.FINE
    return Face.NOT_FOR_US


def next_comparison(
    ranked: list[str], new_mark: str, answers: list[Comparison]
) -> str | None:
    """Return the Mark to ask about next, or None when the position is settled."""
    lo, hi = _replay(ranked, new_mark, answers)
    if lo >= hi:
        return None
    return ranked[(lo + hi) // 2]


def apply(
    ranked: list[str],
    new_mark: str,
    face: Face,
    answers: list[Comparison],
    scores: Mapping[str, float] | None = None,
) -> list[tuple[str, float]]:
    """Insert `new_mark` and return the whole list as (mark, score), best first.

    `scores` holds the current score of existing Marks; it only decides their
    faces. Inputs are never mutated.
    """
    lo, hi = _replay(ranked, new_mark, answers)
    index = lo if lo >= hi else (lo + hi) // 2  # unfinished: settle at midpoint
    known = scores or {}
    faces = [face_for(known[m]) if m in known else face for m in ranked]
    faces = _grouped(faces)
    index = _clamp_to_face(index, faces, face)
    merged = [*ranked[:index], new_mark, *ranked[index:]]
    merged_faces = [*faces[:index], face, *faces[index:]]
    return list(zip(merged, _band_scores(merged_faces), strict=True))


def _replay(
    ranked: list[str], new_mark: str, answers: list[Comparison]
) -> tuple[int, int]:
    """Replay answers through binary insertion; return the remaining (lo, hi)."""
    if new_mark in ranked:
        raise AlreadyRanked(new_mark)
    lo, hi = 0, len(ranked)
    for answer in answers:
        if lo >= hi:
            raise StaleComparison("more answers than comparisons needed")
        mid = (lo + hi) // 2
        if answer.other != ranked[mid]:
            raise StaleComparison(
                f"answer is about {answer.other} but {ranked[mid]} was asked"
            )
        if answer.preferred is None:
            lo = hi = mid + 1
        elif answer.preferred == new_mark:
            hi = mid
        elif answer.preferred == answer.other:
            lo = mid + 1
        else:
            raise StaleComparison(f"{answer.preferred} is not in the pair")
    return lo, hi


def _grouped(faces: list[Face]) -> list[Face]:
    """Faces in list order, forced monotonic (a Mark never outranks a better
    face below it). Lists written by `apply` are already monotonic."""
    out: list[Face] = []
    floor = 0
    for f in faces:
        floor = max(floor, FACE_ORDER.index(f))
        out.append(FACE_ORDER[floor])
    return out


def _clamp_to_face(index: int, faces: list[Face], face: Face) -> int:
    """Nearest insertion index that keeps `face` between better and worse faces."""
    rank = FACE_ORDER.index(face)
    first = sum(1 for f in faces if FACE_ORDER.index(f) < rank)
    last = first + sum(1 for f in faces if f == face)
    return min(max(index, first), last)


def _band_scores(faces: list[Face]) -> list[float]:
    """Even spacing inside each face band, top of the band first."""
    counts = {f: faces.count(f) for f in FACE_ORDER}
    seen = dict.fromkeys(FACE_ORDER, 0)
    out: list[float] = []
    for f in faces:
        low, high = BANDS[f]
        n, i = counts[f], seen[f]
        step = (high - low) / (n - 1) if n > 1 else 0.0
        out.append(round(high - i * step, 4))
        seen[f] = i + 1
    return out
