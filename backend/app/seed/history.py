"""Demo history generator (surfaces lane, S11).

Only the pure, Clock-relative pattern generator lives here for now. Turning
these events into ended `moves`, `move_participants` and `hangouts` rows (the
seed-only direct-insert exception) and mapping the symbolic user/Mark keys to
`seed/ids.py` ids are added once the T0 contract is merged.

Every timestamp is derived from the `now` the caller passes in, so the
patterns stay "recent" on demo day: weekdays are found by walking back whole
days from `now` (never "N days ago"), which keeps them correct on weekends.

Patterns (ARCHITECTURE.md 15.1), eight weeks back at most:
  * Anish + Priya (+ Tony on alternate weeks): matcha on Tuesday afternoons,
    four distinct matcha spots in the last month.
  * Anish + Tony + Maya: Wednesday lunch every other week.
  * Anish + Maya + Dev: Thursday climbing that **stopped four weeks ago**.
  * HS friends: one Saturday hangout about six weeks ago.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlmodel import Session

from app.ports import Clock

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, SATURDAY = 0, 1, 2, 3, 5

MATCHA_SPOTS_THIS_MONTH = ("kumo_matcha", "matcha_b", "matcha_c", "matcha_d")


@dataclass(frozen=True)
class HistoryEvent:
    """One ended Move, described with symbolic user and Mark keys."""

    users: tuple[str, ...]
    mark_key: str
    category: str
    starts_at: datetime
    ends_at: datetime


def generate_history(now: datetime) -> list[HistoryEvent]:
    """All demo history relative to `now`, oldest first. Pure and deterministic."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    events = [
        *_matcha(now),
        *_lunch(now),
        *_climbing(now),
        *_high_school(now),
    ]
    return sorted(events, key=lambda e: (e.starts_at, e.users))


def _matcha(now: datetime) -> list[HistoryEvent]:
    events = []
    for weeks_back in range(7):
        users = (
            ("anish", "priya", "tony") if weeks_back % 2 == 0 else ("anish", "priya")
        )
        spot = MATCHA_SPOTS_THIS_MONTH[weeks_back % len(MATCHA_SPOTS_THIS_MONTH)]
        events.append(_event(now, TUESDAY, weeks_back, 14, 90, users, spot, "coffee"))
    return events


def _lunch(now: datetime) -> list[HistoryEvent]:
    return [
        _event(now, WEDNESDAY, w, 12, 60, ("anish", "tony", "maya"), "chipotle", "food")
        for w in (0, 2, 4, 6)
    ]


def _climbing(now: datetime) -> list[HistoryEvent]:
    # Weeks 4..7 back: the most recent session is always at least 28 days old.
    return [
        _event(
            now,
            THURSDAY,
            w,
            18,
            90,
            ("anish", "maya", "dev"),
            "climbing_gym",
            "climbing",
        )
        for w in range(4, 8)
    ]


def _high_school(now: datetime) -> list[HistoryEvent]:
    return [
        _event(
            now, SATURDAY, 6, 15, 120, ("anish", "hs_1", "hs_2"), "hs_hangout", "food"
        )
    ]


def _event(
    now: datetime,
    weekday: int,
    weeks_back: int,
    hour: int,
    minutes: int,
    users: tuple[str, ...],
    mark_key: str,
    category: str,
) -> HistoryEvent:
    day = _latest_weekday_before(now, weekday) - timedelta(weeks=weeks_back)
    start = day.replace(hour=hour, minute=0, second=0, microsecond=0)
    return HistoryEvent(
        users=users,
        mark_key=mark_key,
        category=category,
        starts_at=start,
        ends_at=start + timedelta(minutes=minutes),
    )


def _latest_weekday_before(now: datetime, weekday: int) -> datetime:
    """The most recent `weekday` strictly before today's date, at `now`'s tz."""
    day = now - timedelta(days=1)
    while day.weekday() != weekday:
        day -= timedelta(days=1)
    return day


def seed(session: Session, clock: Clock) -> None:
    """Seed-runner hook. Writing `generate_history` rows lands with S11's DB part;
    until then it leaves its tables empty."""
