"""City at the map center: rounding, cache, throttle, fallback, HTTP."""

from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.api.routes.areas import get_city_service
from app.core import db
from app.core.logging import strip_nearby_query
from app.main import create_app
from app.services.cities import City, CityService, nominatim
from app.tables import User


class Geo:
    def __init__(self, answer: City | None = None, fail: bool = False) -> None:
        self.calls: list[tuple[float, float]] = []
        self.answer, self.fail = answer, fail

    def __call__(self, lat: float, lng: float) -> City | None:
        self.calls.append((lat, lng))
        if self.fail:
            raise httpx.ConnectError("down")
        return self.answer


def service(geo) -> tuple[CityService, list[float]]:
    slept: list[float] = []
    return CityService(geo, sleep=slept.append, monotonic=lambda: 100.0), slept


def test_asks_with_a_coarse_point_and_caches_the_cell():
    geo = Geo(City("Redwood City", "California"))
    cities, _ = service(geo)
    assert cities.city(37.48612, -122.23277) == City("Redwood City", "California")
    assert cities.city(37.4871, -122.2311) == City("Redwood City", "California")
    assert geo.calls == [(37.49, -122.23)]


def test_back_to_back_lookups_are_spaced_out():
    cities, slept = service(Geo(City("Palo Alto")))
    cities.city(37.44, -122.16)
    cities.city(37.39, -122.08)
    assert slept and slept[0] > 1


def test_geocoder_down_falls_back_to_configured_areas():
    cities, _ = service(Geo(fail=True))
    assert cities.city(37.4850, -122.1482) == City("Menlo Park")
    assert cities.city(40.71, -74.0) == City(None)


def test_no_geocoder_uses_areas_only():
    assert CityService(None).city(37.4850, -122.1482).name == "Menlo Park"


def test_nominatim_reads_the_city_field():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["zoom"] == "10"
        body = {"name": "x", "address": {"city": "Menlo Park", "state": "California"}}
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(handler)
    real_get = httpx.get
    httpx.get = lambda url, **kw: httpx.Client(transport=transport).get(url, **kw)
    try:
        assert nominatim("https://geo.test")(37.48, -122.15) == City(
            "Menlo Park", "California"
        )
    finally:
        httpx.get = real_get


def test_city_query_is_kept_out_of_the_log():
    assert strip_nearby_query("/api/v1/areas/city?lat=1&lng=2").endswith("<redacted>")


@pytest.fixture
def client(engine: Engine, session: Session) -> Iterator[TestClient]:
    session.add(
        User(
            id="u_ana",
            name="Ana",
            first_name="Ana",
            created_at=datetime(2026, 11, 12, tzinfo=UTC),
        )
    )
    session.commit()

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    app.dependency_overrides[get_city_service] = lambda: CityService(
        Geo(City("Redwood City", "California"))
    )
    with TestClient(app) as client:
        yield client


def test_http_city_needs_a_user_and_returns_the_name(client):
    url = "/api/v1/areas/city?lat=37.486&lng=-122.233"
    assert client.get(url).status_code == 401
    res = client.get(url, headers={"X-User-Id": "u_ana"})
    assert res.json() == {"name": "Redwood City", "region": "California"}
