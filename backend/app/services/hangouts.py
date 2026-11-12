"""Hangout rules (surfaces lane, S8).

Only the pure rules live here for now. The `on_move_ended` handler, the
`hangouts` table writes, and the `rate_move` / `rating.prompt` sends are added
once the T0 contract (ports, hooks, tables) is merged.

Decisions:
  * Two people hung out only if their `there` intervals overlap for a positive
    duration. Touching intervals (one leaves exactly as the other arrives) do
    not count.
  * A `left_at` of None means "still there when the Move ended".
  * Everyone who was ever `there` is prompted to rate, even if alone.
  * Hangout bucket is (weekday 0=Monday, hour of day), taken from a timezone-
    aware instant so the caller controls the clock.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from itertools import combinations


@dataclass(frozen=True)
class Presence:
    """One continuous stretch a user spent `there` in a Move."""

    user_id: str
    arrived_at: datetime
    left_at: datetime | None


def overlapping_pairs(
    presences: Iterable[Presence], move_ended_at: datetime
) -> list[tuple[str, str]]:
    """Sorted, de-duplicated (user_a, user_b) pairs with user_a < user_b."""
    spans = [(p.user_id, p.arrived_at, p.left_at or move_ended_at) for p in presences]
    pairs = {
        (min(a_id, b_id), max(a_id, b_id))
        for (a_id, a_start, a_end), (b_id, b_start, b_end) in combinations(spans, 2)
        if a_id != b_id and a_start < b_end and b_start < a_end
    }
    return sorted(pairs)


def rating_recipients(presences: Iterable[Presence]) -> list[str]:
    """Sorted unique users who were ever `there`."""
    return sorted({p.user_id for p in presences})


def hangout_bucket(when: datetime) -> tuple[int, int]:
    """(weekday, hour) for a timezone-aware instant."""
    if when.tzinfo is None:
        raise ValueError("when must be timezone-aware")
    return (when.weekday(), when.hour)
