"""Affinity: how much U clicks with C, from facts Python can count (10.1).

Pure functions only: callers load rows and pass plain values in, so the same
inputs always give the same score. Muse never does this arithmetic; it gets
the features as compact rows (`app/muse/context.py`) and makes the judgment.

    affinity = 3*log(1+hangouts_30d) + 1.5*log(1+hangouts_90d)
             + 2*same_category + 1.5*same_slot + 4*pull_up_rate
             - 0.05*last_hangout_days

`same_category` / `same_slot` are counts, damped with log(1+n) so one
habit cannot drown everything else. `last_hangout_days` is capped at 90 and
counts as 90 when the pair never hung out.

Times: "local" means the zone of the person being served. Their phone reports
it on every request (`core/timezones.py` remembers it per user and sets it for
the request or background scan); `local()` reads it here. `DEFAULT_TZ` (US
Central) is only the answer when nobody has told us where they are.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Literal

from app.ports import Category, HourBucket

DEFAULT_TZ = timezone(timedelta(hours=-6), "CST")
LOCAL_TZ = DEFAULT_TZ  # kept for callers that named the old constant
_zone: ContextVar[tzinfo | None] = ContextVar("local_zone", default=None)
NEVER_DAYS = 90

Currently = Literal["free", "busy", "unknown"]
DistanceBucket = Literal["walkable", "short_drive", "far", "unknown"]
WeekdayType = Literal["weekday", "weekend"]


def current_zone() -> tzinfo | None:
    """The zone set for whoever is being served right now, if any."""
    return _zone.get()


def use_zone(zone: tzinfo | None) -> Token[tzinfo | None]:
    """Make `zone` the local zone for this request or task; undo with `reset_zone`."""
    return _zone.set(zone)


def reset_zone(token: Token[tzinfo | None]) -> None:
    _zone.reset(token)


def local(dt: datetime, zone: tzinfo | None = None) -> datetime:
    """`dt` in `zone`, else in the zone of the person being served, else the default."""
    return dt.astimezone(zone or _zone.get() or DEFAULT_TZ)


def hour_bucket(dt: datetime) -> HourBucket:
    hour = local(dt).hour
    if 5 <= hour < 11:
        return "morning"
    if 11 <= hour < 14:
        return "lunch"
    if 14 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "late"


def weekday_type(weekday: int) -> WeekdayType:
    return "weekend" if weekday >= 5 else "weekday"


def clock_label(dt: datetime) -> str:
    """'2:10' style local time, portable (no %-I on Windows)."""
    t = local(dt)
    return f"{t.hour % 12 or 12}:{t.minute:02d}"


@dataclass(frozen=True, slots=True)
class HangoutFact:
    """One ended Move U and C both attended."""

    move_id: str
    mark_id: str
    category: Category
    weekday: int
    hour_bucket: HourBucket
    at: datetime


@dataclass(frozen=True, slots=True)
class Target:
    """What we are scoring for: a Move (or draft) category, slot and Mark."""

    category: Category | None = None
    weekday: int | None = None
    hour_bucket: HourBucket | None = None
    mark_id: str | None = None

    @classmethod
    def at(
        cls,
        when: datetime,
        category: Category | None = None,
        mark_id: str | None = None,
    ) -> Target:
        return cls(category, local(when).weekday(), hour_bucket(when), mark_id)


@dataclass(frozen=True, slots=True)
class Features:
    hangouts_30d: int = 0
    hangouts_90d: int = 0
    last_hangout_days: int | None = None
    same_category: int = 0
    same_slot: int = 0
    same_mark: int = 0
    nudges: int = 0
    pull_up_rate: float = 0.0
    shared_circles: int = 0
    is_close_friend: bool = False
    currently: Currently = "unknown"
    distance_bucket: DistanceBucket = "unknown"


def features(
    hangouts: Iterable[HangoutFact],
    now: datetime,
    target: Target = Target(),
    *,
    nudges_sent: int = 0,
    nudges_joined: int = 0,
    shared_circles: int = 0,
    is_close_friend: bool = False,
    currently: Currently = "unknown",
    distance_bucket: DistanceBucket = "unknown",
) -> Features:
    facts = list(hangouts)
    ages = [(now - h.at).total_seconds() / 86400 for h in facts]
    recent = [h for h, age in zip(facts, ages, strict=True) if age <= 90]
    target_type = None if target.weekday is None else weekday_type(target.weekday)
    return Features(
        hangouts_30d=sum(1 for age in ages if age <= 30),
        hangouts_90d=len(recent),
        last_hangout_days=int(min(ages)) if ages else None,
        same_category=sum(1 for h in recent if h.category == target.category),
        same_slot=sum(
            1
            for h in recent
            if target.hour_bucket is not None
            and h.hour_bucket == target.hour_bucket
            and weekday_type(h.weekday) == target_type
        ),
        same_mark=sum(
            1 for h in facts if target.mark_id and h.mark_id == target.mark_id
        ),
        nudges=nudges_sent,
        pull_up_rate=round(nudges_joined / nudges_sent, 3) if nudges_sent else 0.0,
        shared_circles=shared_circles,
        is_close_friend=is_close_friend,
        currently=currently,
        distance_bucket=distance_bucket,
    )


def score(f: Features) -> float:
    days = NEVER_DAYS if f.last_hangout_days is None else f.last_hangout_days
    value = (
        3 * math.log1p(f.hangouts_30d)
        + 1.5 * math.log1p(f.hangouts_90d)
        + 2 * math.log1p(f.same_category)
        + 1.5 * math.log1p(f.same_slot)
        + 4 * f.pull_up_rate
        - 0.05 * min(days, NEVER_DAYS)
    )
    return round(value, 3)


def close_friends(hangouts_90d: Mapping[str, int]) -> frozenset[str]:
    """The top quintile of U's hangout partners by 90-day count (ties kept)."""
    active = sorted((n for n in hangouts_90d.values() if n > 0), reverse=True)
    if not active:
        return frozenset()
    cutoff = active[math.ceil(len(active) / 5) - 1]
    return frozenset(uid for uid, n in hangouts_90d.items() if n > 0 and n >= cutoff)


def rank(scores: Mapping[str, float], ids: Sequence[str] | None = None) -> list[str]:
    """Ids by score, highest first; ties broken by id so order is stable."""
    pool = scores.keys() if ids is None else ids
    return sorted(pool, key=lambda uid: (-scores.get(uid, 0.0), uid))
