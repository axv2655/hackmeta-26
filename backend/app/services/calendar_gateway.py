"""`CalendarGateway` over `calendar_events` (surfaces lane, S5).

Other lanes (the flare and free-time agents, Demo Control) ask for a user's
current free window through `container.calendar`; this adapter opens one
short session per call and applies `services.calendar.free_window`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Engine
from sqlmodel import Session

from app.ports import FreeWindow
from app.services.calendar import HORIZON, busy_blocks_between, free_window


class SqlCalendarGateway:
    """Implements `app.ports.CalendarGateway`."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def free_window(self, user_id: str, now: datetime) -> FreeWindow | None:
        with Session(self._engine) as session:
            blocks = busy_blocks_between(session, user_id, now, now + HORIZON)
        gap = free_window(blocks, now)
        return FreeWindow(start=gap.start, end=gap.end) if gap else None
