"""The Clock port's implementations. The only place the backend reads the
wall clock (ARCHITECTURE.md 15.2); everything else asks the `Clock` port.
"""

from datetime import UTC, datetime, timedelta

from app.ports import Clock


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class DemoClock:
    """`base` time plus an offset that Demo Control moves.

    The offset persists across calls, so demo time keeps ticking from wherever
    it was set. Also implements the `TimeControl` port.
    """

    def __init__(self, base: Clock | None = None) -> None:
        self._base = base or SystemClock()
        self._offset = timedelta()

    @property
    def offset(self) -> timedelta:
        return self._offset

    def now(self) -> datetime:
        return self._base.now() + self._offset

    def set_time(self, iso: str) -> None:
        """Jump to `iso`; a value without a timezone is taken as UTC."""
        target = datetime.fromisoformat(iso)
        if target.tzinfo is None:
            target = target.replace(tzinfo=UTC)
        self._offset = target - self._base.now()

    def shift(self, minutes: float) -> None:
        self._offset += timedelta(minutes=minutes)

    def reset(self) -> None:
        self._offset = timedelta()
