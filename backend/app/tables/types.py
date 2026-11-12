"""Column helpers shared by every table module."""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


def new_id() -> str:
    """Short random string id (ARCHITECTURE.md section 5)."""
    return uuid4().hex[:12]


class UTCDateTime(TypeDecorator[datetime]):
    """Stores UTC, always returns timezone-aware UTC.

    SQLite drops tzinfo, so without this a value read back would no longer
    compare with `Clock.now()`. Naive values are rejected on write.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime; use Clock.now() for timestamps")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=UTC)
