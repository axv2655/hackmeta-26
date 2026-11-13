"""Local time follows the phone that asked (core/timezones.py)."""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import timezones
from app.core.timezones import TimezoneMiddleware, as_user, parse_zone, remember
from app.domain import affinity
from app.domain.affinity import clock_label, hour_bucket, local

NOON_UTC = datetime(2026, 11, 13, 20, 0, tzinfo=UTC)  # 2 pm Central, 12 pm Pacific


@pytest.fixture(autouse=True)
def _clean() -> None:
    timezones.forget_all()


def test_default_zone_when_nobody_reported_one() -> None:
    assert affinity.current_zone() is None
    assert clock_label(NOON_UTC) == "2:00"


def test_parse_zone_prefers_name_then_offset() -> None:
    assert local(NOON_UTC, parse_zone("America/Los_Angeles", "0")).hour == 12
    assert local(NOON_UTC, parse_zone("Not/AZone", "-480")).hour == 12
    assert local(NOON_UTC, parse_zone(None, "330")).hour == 1  # 01:30 next day, IST
    assert parse_zone(None, None) is None
    assert parse_zone("", "abc") is None
    assert parse_zone(None, "99999") is None


def test_as_user_uses_that_users_zone_and_restores() -> None:
    remember("u_pacific", timezone(timedelta(hours=-8)))
    with as_user("u_pacific"):
        assert clock_label(NOON_UTC) == "12:00"
        assert hour_bucket(NOON_UTC) == "lunch"
    assert clock_label(NOON_UTC) == "2:00"
    with as_user("u_unknown"):
        assert clock_label(NOON_UTC) == "2:00"


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(TimezoneMiddleware)

    @app.get("/sync")
    def sync_clock() -> dict[str, str]:  # runs in the threadpool
        return {"clock": clock_label(NOON_UTC)}

    @app.get("/async")
    async def async_clock() -> dict[str, str]:
        return {"clock": clock_label(NOON_UTC)}

    return app


@pytest.mark.parametrize("path", ["/sync", "/async"])
def test_request_headers_set_the_local_zone(path: str) -> None:
    client = TestClient(_app())
    pacific = {
        "X-User-Id": "u_a",
        "X-Timezone": "America/Los_Angeles",
        "X-UTC-Offset": "-480",
    }
    assert client.get(path, headers=pacific).json() == {"clock": "12:00"}
    assert client.get(path, headers={"X-UTC-Offset": "-300"}).json() == {
        "clock": "3:00"
    }
    assert client.get(path).json() == {"clock": "2:00"}
    # The zone is remembered per user for later requests and background scans.
    assert client.get(path, headers={"X-User-Id": "u_a"}).json() == {"clock": "12:00"}
    assert affinity.current_zone() is None
