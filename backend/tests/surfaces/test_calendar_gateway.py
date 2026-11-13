"""S5: `SqlCalendarGateway` over `calendar_events`."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import Engine
from sqlmodel import Session

from app.ports import CalendarGateway, FreeWindow
from app.services.calendar_gateway import SqlCalendarGateway
from app.tables import CalendarEvent, User

NOW = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


@pytest.fixture
def gateway(engine: Engine, session: Session) -> SqlCalendarGateway:
    session.add_all(
        User(id=u, name=u.title(), first_name=u.title(), created_at=NOW)
        for u in ("anish", "priya")
    )
    session.commit()
    return SqlCalendarGateway(engine)


def add_event(session: Session, user: str, start: timedelta, minutes: int) -> None:
    session.add(
        CalendarEvent(
            user_id=user,
            title="CS 4349 lecture",
            starts_at=NOW + start,
            ends_at=NOW + start + timedelta(minutes=minutes),
        )
    )
    session.commit()


def test_implements_the_port(gateway: SqlCalendarGateway) -> None:
    assert isinstance(gateway, CalendarGateway)


def test_gap_before_a_class(gateway: SqlCalendarGateway, session: Session) -> None:
    add_event(session, "anish", timedelta(hours=-3), 90)
    add_event(session, "anish", timedelta(minutes=45), 75)
    window = gateway.free_window("anish", NOW)
    assert window == FreeWindow(start=NOW, end=NOW + timedelta(minutes=45))
    assert window.minutes == 45


def test_inside_an_event_is_none(gateway: SqlCalendarGateway, session: Session) -> None:
    add_event(session, "anish", timedelta(minutes=-10), 60)
    assert gateway.free_window("anish", NOW) is None


def test_empty_calendar_is_the_horizon(gateway: SqlCalendarGateway) -> None:
    assert gateway.free_window("anish", NOW).minutes == 240


def test_other_users_events_do_not_count(
    gateway: SqlCalendarGateway, session: Session
) -> None:
    add_event(session, "priya", timedelta(minutes=-10), 60)
    assert gateway.free_window("anish", NOW).minutes == 240
