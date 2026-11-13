"""Deterministic Move ranking by binary pairwise comparison (ARCHITECTURE.md 10.5).

Pure and stdlib-only. The feed ranker, the nobody-bit path and anything else
that orders live Moves for one viewer use this; no model is involved, so the
same inputs always give the same order.

How it works:

* Each Move is reduced to `MoveFacts` (the people on it, the viewer's own
  score for the place, taste fit, the fill timer, how many are going, age).
* `prefer(a, b)` is the one binary question: should `a` sit above `b`? It
  compares the weighted factor totals, then breaks ties newest first, then
  by id. Because it compares totals (not a vote per factor), it is a strict
  total order: transitive, antisymmetric, and never "about the same".
* `rank` places each Move by binary insertion over the list built so far
  (the same halving search the Beli-style rating flow uses, `ranking.py`),
  inserting in id order, so the result does not depend on input order.
* `top_factor` names the factor that did the most for a Move, so the "For
  you" line can say why ("Tony + Priya", "you loved Kumo", "8 min to join").
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

# Factor weights. Each factor is scaled to about -1..1 before weighting, so the
# weight is the factor's say in the comparison.
WEIGHTS: dict[str, float] = {
    "people": 4.0,  # the closest person on the Move (affinity: how often you meet)
    "crowd": 1.5,  # how many people you actually hang out with are on it
    "place": 2.0,  # your own 0-10 score for the Mark (Loved / Fine / Not for us)
    "taste": 1.5,  # category or vibe matches your taste profile
    "urgency": 1.0,  # the fill timer is running out
    "momentum": 1.0,  # how many are going
    "fresh": 0.5,  # just posted
}

AFFINITY_CAP = 10.0  # affinity at or above this counts as fully close
CROWD_CAP = 3  # close people beyond this add nothing
MOMENTUM_CAP = 10  # going counts beyond this add nothing
URGENT_MINUTES = 30  # fill timers under this start to matter
FRESH_MINUTES = 240  # Moves older than this get no freshness credit
NEUTRAL_PLACE = 5.0  # an unrated place scores like a "Fine" one
MIN_REASON = 0.25  # a factor must add at least this much to be the reason


@dataclass(frozen=True, slots=True)
class MoveFacts:
    """What the comparison knows about one Move, from one viewer's side."""

    move_id: str
    best_affinity: float | None = None
    """Highest affinity of anyone on the Move other than the viewer; None if
    nobody there is known."""
    close_count: int = 0
    """People on the Move (not the viewer) with positive affinity."""
    going: int = 0
    """People on the Move other than the viewer, creator included."""
    place_score: float | None = None
    """The viewer's own 0-10 score for the Mark; None if they never rated it."""
    taste_fit: bool = False
    minutes_left: int | None = None
    """Minutes left on the fill timer, when the Move has one."""
    age_minutes: int = 0


def factors(f: MoveFacts) -> dict[str, float]:
    """Each factor scaled to about -1..1 (unweighted)."""
    affinity = f.best_affinity if f.best_affinity is not None else 0.0
    place = f.place_score if f.place_score is not None else NEUTRAL_PLACE
    urgency = 0.0
    if f.minutes_left is not None:
        urgency = max(0.0, 1.0 - max(f.minutes_left, 0) / URGENT_MINUTES)
    return {
        "people": min(max(affinity, 0.0), AFFINITY_CAP) / AFFINITY_CAP,
        "crowd": min(f.close_count, CROWD_CAP) / CROWD_CAP,
        "place": (place - NEUTRAL_PLACE) / NEUTRAL_PLACE,
        "taste": 1.0 if f.taste_fit else 0.0,
        "urgency": urgency,
        "momentum": math.log1p(min(f.going, MOMENTUM_CAP)) / math.log1p(MOMENTUM_CAP),
        "fresh": max(0.0, 1.0 - max(f.age_minutes, 0) / FRESH_MINUTES),
    }


def contributions(f: MoveFacts) -> dict[str, float]:
    """Each factor times its weight."""
    return {name: WEIGHTS[name] * value for name, value in factors(f).items()}


def score(f: MoveFacts) -> float:
    """The weighted total `prefer` compares (rounded so float noise never
    decides a comparison)."""
    return round(sum(contributions(f).values()), 6)


def prefer(a: MoveFacts, b: MoveFacts) -> bool:
    """True if `a` ranks above `b`: higher total, then newer, then lower id."""
    return (-score(a), a.age_minutes, a.move_id) < (-score(b), b.age_minutes, b.move_id)


def rank(moves: Iterable[MoveFacts]) -> list[MoveFacts]:
    """Best first, by binary insertion with `prefer` as the only question."""
    ranked: list[MoveFacts] = []
    for item in sorted(moves, key=lambda m: m.move_id):
        lo, hi = 0, len(ranked)
        while lo < hi:
            mid = (lo + hi) // 2
            if prefer(item, ranked[mid]):
                hi = mid
            else:
                lo = mid + 1
        ranked.insert(lo, item)
    return ranked


def top_factor(f: MoveFacts) -> str | None:
    """The factor that adds the most for this Move, or None if nothing adds
    at least `MIN_REASON` (then the Move gets no reason line)."""
    best = max(sorted(contributions(f).items()), key=lambda kv: kv[1])
    return best[0] if best[1] >= MIN_REASON else None


def order_ids(moves: Sequence[MoveFacts]) -> list[str]:
    return [m.move_id for m in rank(moves)]
