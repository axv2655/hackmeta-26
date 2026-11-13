"""S5: the pure free_window rule, plus GET /calendar and PUT /calendar/busy
as HTTP round trips."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.main import create_app
from app.services.calendar import HORIZON, BusyBlock, Gap, free_window
from app.services.calendar_gateway import SqlCalendarGateway
from app.tables import CalendarEvent, User, UserSettings


def at(hour, minute=0, day=12):
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def block(start, end):
    return BusyBlock(start=start, end=end)


class TestSeededDemoGap:
    def test_gap_before_the_three_oclock_class(self):
        events = [block(at(9), at(10)), block(at(15), at(16, 15))]
        assert free_window(events, at(14, 10)) == Gap(at(14, 10), at(15))

    def test_gap_is_fifty_minutes(self):
        gap = free_window([block(at(15), at(16))], at(14, 10))
        assert gap.end - gap.start == timedelta(minutes=50)


class TestNoWindow:
    def test_now_inside_an_event_returns_none(self):
        assert free_window([block(at(14), at(15))], at(14, 30)) is None

    def test_event_starting_exactly_now_returns_none(self):
        assert free_window([block(at(14), at(15))], at(14)) is None

    def test_back_to_back_events_leave_no_window(self):
        events = [block(at(13), at(14)), block(at(14), at(15))]
        assert free_window(events, at(14)) is None

    def test_gap_shorter_than_minimum_returns_none(self):
        assert free_window([block(at(15), at(16))], at(14, 41)) is None

    def test_gap_of_exactly_the_minimum_is_returned(self):
        assert free_window([block(at(15), at(16))], at(14, 40)) == Gap(
            at(14, 40), at(15)
        )

    def test_custom_minimum_is_respected(self):
        assert free_window([block(at(15), at(16))], at(14, 40), min_minutes=30) is None


class TestHorizon:
    def test_no_later_event_is_capped_at_the_horizon(self):
        gap = free_window([block(at(9), at(10))], at(14))
        assert gap == Gap(at(14), at(14) + HORIZON)

    def test_empty_calendar_is_capped_at_the_horizon(self):
        assert free_window([], at(14)) == Gap(at(14), at(14) + HORIZON)

    def test_next_event_beyond_the_horizon_is_still_capped(self):
        gap = free_window([block(at(23), at(23, 30))], at(14))
        assert gap.end == at(14) + HORIZON

    def test_window_may_cross_midnight(self):
        gap = free_window(
            [],
            at(22),
        )
        assert gap.end == at(22) + HORIZON
        assert gap.end.day == 13


class TestMessyEvents:
    def test_overlapping_events_are_handled(self):
        events = [block(at(15), at(16)), block(at(15, 30), at(17))]
        assert free_window(events, at(14, 10)) == Gap(at(14, 10), at(15))

    def test_event_spanning_midnight_blocks_now(self):
        events = [block(at(23), at(1, day=13))]
        assert free_window(events, at(23, 30)) is None

    def test_past_events_are_ignored(self):
        assert free_window([block(at(8), at(9))], at(14)) == Gap(
            at(14), at(14) + HORIZON
        )

    def test_unsorted_events_are_handled(self):
        events = [block(at(18), at(19)), block(at(15), at(16))]
        assert free_window(events, at(14, 10)).end == at(15)


class TestInputs:
    def test_naive_now_is_rejected(self):
        with pytest.raises(ValueError):
            free_window([], datetime(2026, 11, 12, 14))

    def test_shifted_now_shifts_the_window(self):
        events = [block(at(15), at(16))]
        assert free_window(events, at(14)).start == at(14)
        assert free_window(events, at(14, 30)).start == at(14, 30)

    def test_events_are_not_mutated(self):
        events = [block(at(18), at(19)), block(at(15), at(16))]
        free_window(events, at(14))
        assert [e.start for e in events] == [at(18), at(15)]


# --- HTTP: GET /calendar, PUT /calendar/busy ----------------------------------

NOW = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


class FixedClock:
    def now(self) -> datetime:
        return NOW


def event(user: str, start_min: int, minutes: int, title: str | None) -> CalendarEvent:
    start = NOW + timedelta(minutes=start_min)
    return CalendarEvent(
        user_id=user,
        title=title,
        starts_at=start,
        ends_at=start + timedelta(minutes=minutes),
    )


@pytest.fixture
def client(engine: Engine, session: Session) -> Iterator[TestClient]:
    session.add_all(
        User(id=u, name=u.title(), first_name=u.title(), created_at=NOW)
        for u in ("anish", "priya")
    )
    session.add(UserSettings(user_id="anish", calendar_opt_in=True))
    session.add_all(
        [
            event("anish", -240, 90, "Data structures"),  # ended 2.5 h ago
            event("anish", -150, 60, "Lab"),  # ended 30 min ago: shown
            event("anish", 45, 75, "CS 4349 lecture"),
            event("anish", 13 * 60, 60, "Too late"),
            event("priya", 10, 30, "Priya only"),
        ]
    )
    session.commit()

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        app.state.container.clock = FixedClock()
        app.state.container.calendar = SqlCalendarGateway(engine)
        client.headers["X-User-Id"] = "anish"
        yield client


class TestCalendarRoutes:
    def test_day_lists_events_and_the_free_window(self, client: TestClient) -> None:
        body = client.get("/api/v1/calendar").json()
        assert [e["title"] for e in body["events"]] == ["Lab", "CS 4349 lecture"]
        assert set(body["events"][0]) == {
            "id",
            "title",
            "starts_at",
            "ends_at",
            "place",
        }
        assert body["free_window"]["minutes"] == 45
        assert body["free_window"]["end"].startswith("2026-11-12T14:45")

    def test_busy_blocks_replace_title_less_blocks(
        self, client: TestClient, engine: Engine
    ) -> None:
        first = {"start": "2026-11-12T14:20:00Z", "end": "2026-11-12T14:40:00Z"}
        assert (
            client.put("/api/v1/calendar/busy", json={"blocks": [first]}).status_code
            == 204
        )
        assert client.get("/api/v1/calendar").json()["free_window"]["minutes"] == 20

        second = {"start": "2026-11-12T16:00:00Z", "end": "2026-11-12T17:00:00Z"}
        assert (
            client.put("/api/v1/calendar/busy", json={"blocks": [second]}).status_code
            == 204
        )
        with Session(engine) as s:
            blocks = s.exec(
                select(CalendarEvent).where(CalendarEvent.title == None)  # noqa: E711
            ).all()
        assert [b.starts_at.hour for b in blocks] == [16]
        assert client.get("/api/v1/calendar").json()["free_window"]["minutes"] == 45

    def test_end_before_start_is_422(self, client: TestClient) -> None:
        bad = {"start": "2026-11-12T15:00:00Z", "end": "2026-11-12T15:00:00Z"}
        response = client.put("/api/v1/calendar/busy", json={"blocks": [bad]})
        assert response.status_code == 422

    def test_requires_a_user(self, client: TestClient) -> None:
        response = client.get("/api/v1/calendar", headers={"X-User-Id": "nobody"})
        assert response.status_code == 401


def device_blocks(engine: Engine, user: str = "anish") -> list[CalendarEvent]:
    with Session(engine) as s:
        return list(
            s.exec(
                select(CalendarEvent)
                .where(CalendarEvent.user_id == user)
                .where(CalendarEvent.title == None)  # noqa: E711
                .order_by(CalendarEvent.starts_at)
            )
        )


def put(client: TestClient, *blocks: tuple[str, str], user: str = "anish") -> int:
    body = {"blocks": [{"start": a, "end": b} for a, b in blocks]}
    headers = {"X-User-Id": user}
    return client.put("/api/v1/calendar/busy", json=body, headers=headers).status_code


class TestDeviceSync:
    """The phone's calendar (expo-calendar) syncs busy blocks only."""

    def test_an_event_in_progress_is_replaced_not_duplicated(
        self, client: TestClient, engine: Engine
    ) -> None:
        ongoing = ("2026-11-12T13:30:00Z", "2026-11-12T14:30:00Z")
        assert put(client, ongoing) == 204
        assert put(client, ongoing) == 204
        assert len(device_blocks(engine)) == 1
        assert client.get("/api/v1/calendar").json()["free_window"] is None

    def test_blocks_outside_the_next_day_are_dropped(
        self, client: TestClient, engine: Engine
    ) -> None:
        past = ("2026-11-12T10:00:00Z", "2026-11-12T11:00:00Z")
        later = ("2026-11-14T10:00:00Z", "2026-11-14T11:00:00Z")
        soon = ("2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z")
        assert put(client, past, later, soon) == 204
        assert [b.starts_at.hour for b in device_blocks(engine)] == [16]

    def test_nothing_is_stored_without_calendar_opt_in(
        self, client: TestClient, engine: Engine
    ) -> None:
        assert (
            put(client, ("2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z"), user="priya")
            == 204
        )
        assert device_blocks(engine, "priya") == []

    def test_mock_and_demo_rows_survive_a_sync(
        self, client: TestClient, engine: Engine
    ) -> None:
        assert put(client) == 204
        titles = [e["title"] for e in client.get("/api/v1/calendar").json()["events"]]
        assert titles == ["Lab", "CS 4349 lecture"]

    def test_opting_out_clears_the_phone_blocks(
        self, client: TestClient, engine: Engine, session: Session
    ) -> None:
        assert put(client, ("2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z")) == 204
        response = client.patch("/api/v1/me/settings", json={"calendar_opt_in": False})
        assert response.status_code == 200
        assert device_blocks(engine) == []
        titles = [e["title"] for e in client.get("/api/v1/calendar").json()["events"]]
        assert titles == ["Lab", "CS 4349 lecture"]
