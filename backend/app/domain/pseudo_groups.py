"""Pseudo-group detection (ARCHITECTURE.md 10.8): pure functions over hangouts.

An *outing* is one ended Move the owner attended, with everyone else who was
there. A pseudo-group is a recurring set of 2 to 6 people (owner included):

- Candidate sets are the exact sets of people seen on some outing.
- A set's support is the number of outings that include all of it, with at
  most one extra person (so "Anish + Priya, sometimes Tony" still counts).
- A set needs `MIN_OUTINGS` support. For a set S and a qualifying superset
  T: when T has at least `ABSORB` of S's support, T is the real crew and S
  is dropped; otherwise, if T is S plus one occasional member, T is dropped
  (S "sometimes with T's extra person" is the crew).
- `fading`: the last outing is older than 2.5x the usual (median) gap,
  and at least 14 days.

Pattern: categories, weekdays and hour buckets that make up at least a third
of the outings, and the top 3 Marks.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from statistics import median
from typing import Any, Protocol

from app.domain.errors import NotFound

MIN_OUTINGS = 3
MAX_OTHERS = 5  # groups of 2 to 6 including the owner
ABSORB = 0.75
FADING_FACTOR = 2.5
FADING_MIN_DAYS = 14
STRENGTH_HALF_LIFE_DAYS = 60
HISTORY_WEEKS = 12
WEEKDAY_NAMES = (
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
    "Sundays",
)


class PseudoGroupNotFound(NotFound):
    """No such pseudo-group, or it belongs to someone else (indistinguishable:
    pseudo-groups are private to their owner)."""

    def __init__(self, group_id: str) -> None:
        super().__init__("Pseudo-group not found")
        self.group_id = group_id


class HangoutLike(Protocol):
    user_a: str
    user_b: str
    move_id: str
    mark_id: str
    category: str
    weekday: int
    hour_bucket: str
    at: datetime


@dataclass(frozen=True)
class Outing:
    move_id: str
    at: datetime
    mark_id: str
    category: str
    weekday: int
    hour_bucket: str
    people: frozenset[str]


@dataclass(frozen=True)
class Cluster:
    members: frozenset[str]  # excluding the owner
    outings: tuple[Outing, ...]
    pattern: dict[str, list[Any]] = field(hash=False)
    strength: float
    last_at: datetime
    usual_gap_days: float | None
    fading: bool

    @property
    def key(self) -> tuple[str, ...]:
        return tuple(sorted(self.members))


def outings(owner: str, hangouts: Iterable[HangoutLike]) -> list[Outing]:
    by_move: dict[str, list[HangoutLike]] = defaultdict(list)
    for h in hangouts:
        by_move[h.move_id].append(h)
    out = []
    for move_id, rows in by_move.items():
        people = {u for h in rows for u in (h.user_a, h.user_b)}
        if owner not in people:
            continue
        h = rows[0]
        out.append(
            Outing(
                move_id,
                h.at,
                h.mark_id,
                h.category,
                h.weekday,
                h.hour_bucket,
                frozenset(people - {owner}),
            )
        )
    out.sort(key=lambda o: o.at)
    return out


def _supports(members: frozenset[str], outing: Outing) -> bool:
    return members <= outing.people and len(outing.people - members) <= 1


def _common(values: Iterable[Any], total: int, top: int | None = None) -> list[Any]:
    counts = Counter(values)
    ranked = sorted(counts, key=lambda v: (-counts[v], str(v)))
    if top is not None:
        return ranked[:top]
    return [v for v in ranked if counts[v] * 3 >= total]


def pattern_of(group: list[Outing]) -> dict[str, list[Any]]:
    n = len(group)
    return {
        "categories": _common((o.category for o in group), n),
        "weekdays": _common((o.weekday for o in group), n),
        "hour_buckets": _common((o.hour_bucket for o in group), n),
        "mark_ids": _common((o.mark_id for o in group), n, top=3),
    }


def is_fading(times: list[datetime], now: datetime) -> tuple[bool, float | None]:
    gaps = [
        (b - a).total_seconds() / 86400 for a, b in zip(times, times[1:], strict=False)
    ]
    usual = median(gaps) if gaps else None
    since = (now - times[-1]).total_seconds() / 86400
    threshold = max(FADING_MIN_DAYS, FADING_FACTOR * (usual or 0))
    return since > threshold, usual


def strength_of(group: list[Outing], now: datetime) -> float:
    decay = math.log(2) / STRENGTH_HALF_LIFE_DAYS
    return round(
        sum(math.exp(-decay * (now - o.at).total_seconds() / 86400) for o in group), 3
    )


def detect(owner: str, all_outings: list[Outing], now: datetime) -> list[Cluster]:
    sets = {o.people for o in all_outings if 1 <= len(o.people) <= MAX_OTHERS}
    support = {s: [o for o in all_outings if _supports(s, o)] for s in sets}
    qualified = {s: g for s, g in support.items() if len(g) >= MIN_OUTINGS}

    def absorbed(s: frozenset[str], g: list[Outing]) -> bool:
        for t, tg in qualified.items():
            if s < t and len(tg) >= ABSORB * len(g):
                return True  # a bigger crew explains s
            if t < s and len(s - t) == 1 and len(g) < ABSORB * len(tg):
                return True  # s is t plus an occasional member
        return False

    kept = {s: g for s, g in qualified.items() if not absorbed(s, g)}
    clusters = []
    for members, group in kept.items():
        times = [o.at for o in group]
        fading, usual = is_fading(times, now)
        clusters.append(
            Cluster(
                members=members,
                outings=tuple(group),
                pattern=pattern_of(group),
                strength=strength_of(group, now),
                last_at=times[-1],
                usual_gap_days=None if usual is None else round(usual, 1),
                fading=fading,
            )
        )
    clusters.sort(key=lambda c: (-c.strength, c.key))
    return clusters


def weekly_history(
    times: Iterable[datetime], now: datetime, weeks: int = HISTORY_WEEKS
) -> list[int]:
    """Hangouts per week, oldest first, the last bucket ending at `now`."""
    counts = [0] * weeks
    for at in times:
        age_weeks = int((now - at).total_seconds() // (7 * 86400))
        if 0 <= age_weeks < weeks:
            counts[weeks - 1 - age_weeks] += 1
    return counts


def fallback_label(pattern: dict[str, list[Any]]) -> str:
    categories = pattern.get("categories") or ["hangout"]
    return f"{categories[0]} crew"


def describe_when(pattern: dict[str, list[Any]]) -> str:
    days = pattern.get("weekdays") or []
    return WEEKDAY_NAMES[days[0]] if len(days) == 1 else "weekdays" if days else ""
