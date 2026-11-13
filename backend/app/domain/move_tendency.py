"""How long a creator's Moves usually last (the tendency tab on a live Move).

Pure and stdlib-only. The muse lane loads the creator's ended Moves and asks
`tendency` for the facts; Muse (or `template_line`) turns them into words.

Order of evidence, most specific first:
  1. ended Moves at the same Mark,
  2. ended Moves in the same category,
  3. all ended Moves.
A level counts only with at least `MIN_SAMPLES` usable Moves. With none, there
is no tendency and the tab is not shown: we never guess.

A Move is usable when it lasted at least `MIN_DURATION` and less than
`STALE_AFTER`: a Move the scheduler auto-ended as stale has an `ends_at` set by
the sweep, not by people, so it would inflate the median.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median
from typing import Literal

from app.domain.moves import STALE_AFTER

MIN_SAMPLES = 2
MIN_DURATION = timedelta(minutes=10)

Basis = Literal["mark", "category", "all"]


@dataclass(frozen=True, slots=True)
class PastMove:
    mark_id: str
    category: str
    starts_at: datetime
    ends_at: datetime

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at


@dataclass(frozen=True, slots=True)
class Tendency:
    typical_minutes: int
    basis: Basis
    sample_size: int


@dataclass(frozen=True, slots=True)
class TendencyNote:
    """What the tab shows for one live Move. `source` is 'muse' only when the
    model wrote `line` without falling back."""

    line: str
    typical_minutes: int
    basis: Basis
    sample_size: int
    source: Literal["muse", "heuristic"] = "heuristic"


def usable(move: PastMove) -> bool:
    return MIN_DURATION <= move.duration < STALE_AFTER


def tendency(past: Sequence[PastMove], mark_id: str, category: str) -> Tendency | None:
    """The median length of the creator's past Moves at the most specific level
    with enough evidence, or None."""
    good = [m for m in past if usable(m)]
    levels: tuple[tuple[Basis, list[PastMove]], ...] = (
        ("mark", [m for m in good if m.mark_id == mark_id]),
        ("category", [m for m in good if m.category == category]),
        ("all", good),
    )
    for basis, moves in levels:
        if len(moves) >= MIN_SAMPLES:
            minutes = median(m.duration.total_seconds() / 60 for m in moves)
            return Tendency(round(minutes), basis, len(moves))
    return None


def format_duration(minutes: int) -> str:
    """'~45m' under an hour (to 5 min), else '~1h', '~1.5h', '~2h' (to 30 min)."""
    if minutes < 55:
        return f"~{max(5, 5 * round(minutes / 5))}m"
    halves = max(2, round(minutes / 30))
    hours = halves / 2
    return f"~{hours:g}h"


def subject(first_name: str, mark_name: str, category: str, basis: Basis) -> str:
    """Whose Moves the number describes: "Tony's Kumo Moves"."""
    owner = f"{first_name}'s" if first_name else "Their"
    if basis == "mark":
        return f"{owner} {mark_name} Moves"
    if basis == "category":
        return f"{owner} {category} Moves"
    return f"{owner} Moves"


def template_line(
    first_name: str, mark_name: str, category: str, found: Tendency
) -> str:
    """ "Tony's Kumo Moves usually last ~2h". The client adds "Started 7:00, "
    in the viewer's own time zone."""
    who = subject(first_name, mark_name, category, found.basis)
    return f"{who} usually last {format_duration(found.typical_minutes)}"
