"""Calendar service (surfaces lane, S5).

Only the pure free-window rule lives here for now. The `calendar_events`
storage, `GET /calendar`, `PUT /calendar/busy` and the `CalendarGateway`
adapter are added once the T0 contract (ports, tables) is merged.

Privacy: a busy block is just a start and an end. Titles from a device
calendar are never part of this model, so they cannot be stored by accident.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

# How far ahead an open-ended gap is allowed to reach.
HORIZON = timedelta(hours=4)
DEFAULT_MIN_MINUTES = 20


@dataclass(frozen=True)
class BusyBlock:
    """A busy interval. Deliberately has no title field."""

    start: datetime
    end: datetime


@dataclass(frozen=True)
class Gap:
    """A free interval, in the same timezone as the inputs (UTC in practice)."""

    start: datetime
    end: datetime


def free_window(
    events: Iterable[BusyBlock],
    now: datetime,
    min_minutes: int = DEFAULT_MIN_MINUTES,
) -> Gap | None:
    """Return the *current* free gap, or None.

    The gap runs from `now` to the start of the next event, capped at
    `now + HORIZON` when nothing follows. If `now` is inside an event there is
    no current gap (this does not look ahead to a later one). Gaps shorter than
    `min_minutes` return None. All arithmetic is on absolute instants, so
    crossing midnight needs no special case.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    blocks = list(events)
    if any(b.start <= now < b.end for b in blocks):
        return None
    upcoming = [b.start for b in blocks if b.start > now]
    end = min([now + HORIZON, *upcoming])
    if end - now < timedelta(minutes=min_minutes):
        return None
    return Gap(start=now, end=end)
