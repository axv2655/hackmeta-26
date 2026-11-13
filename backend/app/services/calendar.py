"""Calendar service (surfaces lane, S5).

The pure free-window rule (`free_window`) plus `CalendarService`, which reads a
user's day and replaces their device busy blocks over `calendar_events`.

Privacy: a busy block is just a start and an end. Titles from a device
calendar are never part of `BusyBlock`, and `replace_busy` stores blocks with
no title, so a device title cannot be stored by accident. Device blocks are the
rows with neither a title nor a location (mock and Demo Control rows always
carry a title); they are written only while the user has `calendar_opt_in` on,
and opting out drops them all (`UsersService.update_settings`).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, select

from app.domain.errors import Invalid
from app.tables import CalendarEvent, UserSettings

# How far ahead an open-ended gap is allowed to reach.
HORIZON = timedelta(hours=4)
DEFAULT_MIN_MINUTES = 20

# The window `GET /calendar` shows, around now.
DAY_BEFORE = timedelta(hours=2)
DAY_AFTER = timedelta(hours=12)
# `PUT /calendar/busy` replaces the caller's title-less blocks starting this soon.
BUSY_REPLACE_SPAN = timedelta(hours=24)


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


class InvalidBusyBlock(Invalid):
    """A busy block whose end is not after its start."""

    def __init__(self) -> None:
        super().__init__("a busy block must end after it starts")


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


def as_utc(value: datetime) -> datetime:
    """A naive client timestamp is read as UTC; aware ones are converted."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def busy_blocks_between(
    session: Session, user_id: str, start: datetime, end: datetime
) -> list[BusyBlock]:
    """Every event of the user overlapping `[start, end)`, as title-less blocks."""
    return [
        BusyBlock(start=e.starts_at, end=e.ends_at)
        for e in events_between(session, user_id, start, end)
    ]


def device_rows(user_id: str):
    """Rows that came from a phone calendar: no title and no location."""
    return select(CalendarEvent).where(
        CalendarEvent.user_id == user_id,
        col(CalendarEvent.title).is_(None),
        col(CalendarEvent.location).is_(None),
    )


def calendar_opted_in(session: Session, user_id: str) -> bool:
    row = session.get(UserSettings, user_id)
    return bool(row and row.calendar_opt_in)


def events_between(
    session: Session, user_id: str, start: datetime, end: datetime
) -> list[CalendarEvent]:
    stmt = (
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.ends_at > start,
            CalendarEvent.starts_at < end,
        )
        .order_by(col(CalendarEvent.starts_at), col(CalendarEvent.id))
    )
    return list(session.exec(stmt))


class CalendarService:
    """A user's mock calendar day and their device busy blocks."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def day(self, user_id: str, now: datetime) -> list[CalendarEvent]:
        """Events overlapping now-2h .. now+12h, ordered by start."""
        return events_between(self.session, user_id, now - DAY_BEFORE, now + DAY_AFTER)

    def replace_busy(
        self, user_id: str, blocks: Sequence[BusyBlock], now: datetime
    ) -> int:
        """Replace the caller's device blocks overlapping the next 24 h with
        `blocks` (an event already in progress counts). Validates every block
        before writing anything. Blocks outside the next 24 h are dropped, and
        nothing is stored unless the user has `calendar_opt_in` on (the stale
        blocks are still removed). Returns how many blocks were stored."""
        clean = [BusyBlock(as_utc(b.start), as_utc(b.end)) for b in blocks]
        if any(b.end <= b.start for b in clean):
            raise InvalidBusyBlock()
        until = now + BUSY_REPLACE_SPAN
        stale = self.session.exec(
            device_rows(user_id).where(
                CalendarEvent.ends_at > now, CalendarEvent.starts_at < until
            )
        )
        for row in stale:
            self.session.delete(row)
        keep = [b for b in clean if b.end > now and b.start < until]
        if not calendar_opted_in(self.session, user_id):
            keep = []
        self.session.add_all(
            CalendarEvent(user_id=user_id, starts_at=b.start, ends_at=b.end)
            for b in keep
        )
        self.session.commit()
        return len(keep)
