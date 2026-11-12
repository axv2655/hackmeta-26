"""Fakes of foreign ports for core-lane tests only.

Never import another lane's fakes: a bug in theirs must not mask or break yours.
"""

from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from app.ports import EventType


class FixedClock:
    """A `Clock` that only moves when told to."""

    def __init__(self, now: datetime) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)


class RecordingPublisher:
    """An `EventPublisher` that keeps every publish as `(user_ids, type, data)`."""

    def __init__(self) -> None:
        self.published: list[tuple[frozenset[str], EventType, dict[str, Any]]] = []

    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        self.published.append((frozenset(user_ids), type, data))

    def of_type(self, type: EventType) -> list[tuple[frozenset[str], dict[str, Any]]]:
        return [(users, data) for users, t, data in self.published if t == type]
