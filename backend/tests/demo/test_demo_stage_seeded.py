"""Every extra Demo Control trigger works as Anish on the full seed world, the
way the demo phone uses it (no ids passed beyond the picked friend)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.core.clock import DemoClock, SystemClock
from app.core.config import settings
from app.core.gateways import SqlMarkGateway, SqlMoveGateway, SqlUserGateway
from app.lanes import muse as muse_lane
from app.lanes import surfaces as surfaces_lane
from app.main import create_app
from app.muse.client import FakeMuseClient
from app.seed import ids
from app.seed import seed as seed_runner
from app.services import examples
from tests.core.fakes import RecordingPublisher

API = "/api/v1/demo"


@pytest.fixture
def anish(
    engine: Engine, session: Session, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    seed_runner.run(session, SystemClock())
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    clock = DemoClock()

    def registrar(container, hooks, scheduler) -> None:
        container.clock = container.time_control = clock
        container.events = RecordingPublisher()
        container.users = SqlUserGateway(engine, clock)
        container.moves = SqlMoveGateway(engine, clock, container.events, hooks)
        container.marks = SqlMarkGateway(engine, clock)
        surfaces_lane.register(container, hooks, scheduler, engine=engine)
        muse_lane.register(
            container, hooks, scheduler, engine=engine, client=FakeMuseClient()
        )

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=(registrar,))
    app.dependency_overrides[db.get_session] = session_override
    examples.release_all()
    with TestClient(app) as client:
        client.headers["X-User-Id"] = ids.ANISH
        yield client
    examples.release_all()


def ok(response: Any) -> Any:
    assert response.status_code == 200, response.text
    return response.json()


def test_every_extra_trigger_on_the_seed_world(anish: TestClient):
    request = ok(anish.post(f"{API}/friend-request", json={}))
    assert request == {"user_id": ids.JORDAN, "relation": "outgoing"}

    route = ok(anish.post(f"{API}/route", json={"user_id": ids.TONY}))
    assert route["suggestion"] is not None
    assert route["suggestion"]["type"] == "route"

    move = ok(
        anish.post(
            f"{API}/friend-move",
            json={"user_id": ids.ANISH, "mark_id": ids.CHIPOTLE, "text": "chipotle"},
        )
    )
    moment = ok(anish.post(f"{API}/moment", json={"user_id": ids.TONY}))
    assert moment["move_id"] == move["move_id"]

    ok(anish.post(f"{API}/notify-test"))
    for name in ok(anish.get(f"{API}/jobs"))["jobs"]:
        ok(anish.post(f"{API}/jobs/{name}"))
