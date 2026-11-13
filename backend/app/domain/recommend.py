"""Deterministic scores for recommended Moves and people (ARCHITECTURE.md 10.6).

Pure and stdlib-only. The flare / free-time scan uses these instead of asking
a model whether to act:

* A saved place is worth a flare when `place_score` reaches `FLARE_MIN`: the
  user rated it well, it fits their taste, they keep going there with the
  friends who are free, or they saved it recently.
* A free friend is worth inviting when `person_score` is positive: affinity
  (how often you hang out, recently, how often you pull up) plus a bonus for
  people in one of your crews.
* With no place worth it, a free-time nudge fires only for a friend whose
  score reaches `FREE_TIME_MIN`.

Ties always break by id, so the same inputs give the same pick.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

PLACE_WEIGHTS: dict[str, float] = {
    "rating": 2.0,  # the user's own 0-10 score for the Mark
    "taste": 1.5,  # category or vibe tags in their taste profile
    "together": 1.5,  # hangouts there with the friends who are free now
    "fresh": 1.0,  # saved recently
}
NEUTRAL_RATING = 5.0
TOGETHER_CAP = 3
FRESH_DAYS = 30
FLARE_MIN = 1.5  # needs a real signal: a good rating, taste fit or a crew spot
CREW_BONUS = 2.0
FREE_TIME_MIN = 1.0
MAX_INVITES = 3


@dataclass(frozen=True, slots=True)
class PlaceOption:
    mark_id: str
    rating: float | None = None
    taste_fit: bool = False
    together: int = 0
    saved_days: int = 0


@dataclass(frozen=True, slots=True)
class PersonOption:
    user_id: str
    affinity: float
    crew: bool = False


def place_parts(o: PlaceOption) -> dict[str, float]:
    rating = o.rating if o.rating is not None else NEUTRAL_RATING
    parts = {
        "rating": (rating - NEUTRAL_RATING) / NEUTRAL_RATING,
        "taste": 1.0 if o.taste_fit else 0.0,
        "together": min(o.together, TOGETHER_CAP) / TOGETHER_CAP,
        "fresh": max(0.0, 1.0 - max(o.saved_days, 0) / FRESH_DAYS),
    }
    return {k: PLACE_WEIGHTS[k] * v for k, v in parts.items()}


def place_score(o: PlaceOption) -> float:
    return round(sum(place_parts(o).values()), 6)


def place_reason(o: PlaceOption) -> str:
    """The part that did the most for this place: rating / taste / together / fresh."""
    return max(sorted(place_parts(o).items()), key=lambda kv: kv[1])[0]


def rank_places(options: Iterable[PlaceOption]) -> list[PlaceOption]:
    return sorted(options, key=lambda o: (-place_score(o), o.saved_days, o.mark_id))


def person_score(p: PersonOption) -> float:
    return round(p.affinity + (CREW_BONUS if p.crew else 0.0), 6)


def rank_people(options: Iterable[PersonOption]) -> list[PersonOption]:
    return sorted(options, key=lambda p: (-person_score(p), p.user_id))


def invites(
    options: Sequence[PersonOption], *, force: bool = False, limit: int = MAX_INVITES
) -> list[PersonOption]:
    """Friends to invite, best first: positive scores only, unless `force`
    (Demo Control) asks for someone anyway."""
    ranked = rank_people(options)
    picked = [p for p in ranked if person_score(p) > 0]
    if not picked and force:
        picked = ranked
    return picked[:limit]


@dataclass(frozen=True, slots=True)
class Decision:
    type: str  # "flare" | "free_time"
    place: PlaceOption | None
    invite: tuple[PersonOption, ...]


def decide(
    places: Sequence[PlaceOption],
    people: Sequence[PersonOption],
    *,
    force: bool = False,
) -> Decision | None:
    """Flare the best saved place if it clears `FLARE_MIN`, else a free-time
    nudge if a free friend clears `FREE_TIME_MIN`, else nothing. `force`
    skips both thresholds (still needs a place or a person)."""
    invite = tuple(invites(people, force=force))
    ranked = rank_places(places)
    if ranked and (force or place_score(ranked[0]) >= FLARE_MIN):
        return Decision("flare", ranked[0], invite)
    best = rank_people(people)
    if best and (force or person_score(best[0]) >= FREE_TIME_MIN):
        return Decision("free_time", None, invite or (best[0],))
    return None
