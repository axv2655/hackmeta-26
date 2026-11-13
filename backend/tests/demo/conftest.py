"""A small world and an app booted in DEMO_MODE on the test engine.

ana is the phone. tony is ana's friend; bo is tony's friend (not ana's).
The app runs the real core gateways and the real muse lane (FakeMuseClient),
so a Demo Control Move goes through the same notify pipeline as any other.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.core.clock import DemoClock
from app.core.config import settings
from app.core.gateways import SqlMarkGateway, SqlMoveGateway
from app.lanes import muse as muse_lane
from app.main import create_app
from app.muse.client import FakeMuseClient
from app.seed import ids
from app.tables import Friendship, Mark, User
from tests.core.fakes import FixedClock, RecordingPublisher

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
USERS = ("ana", "tony", "bo")
KUMO = ids.KUMO_MATCHA


@pytest.fixture
def world(session: Session) -> Session:
    session.add_all(
        User(id=u, name=f"{u.title()} X", first_name=u.title(), created_at=T0)
        for u in USERS
    )
    session.add(
        Mark(id=KUMO, name="Kumo Matcha", category="coffee", lat=30.28, lng=-97.74)
    )
    session.add_all(
        [
            Friendship(user_a="ana", user_b="tony", since=T0),
            Friendship(user_a="bo", user_b="tony", since=T0),
        ]
    )
    session.commit()
    return session


@pytest.fixture
def demo_clock() -> DemoClock:
    return DemoClock(FixedClock(T0))


def boot(engine: Engine, clock: DemoClock) -> tuple[Any, dict[str, Any]]:
    state: dict[str, Any] = {}

    def registrar(container, hooks, scheduler) -> None:
        container.clock = clock
        container.time_control = clock
        container.events = RecordingPublisher()
        container.moves = SqlMoveGateway(engine, clock, container.events, hooks)
        container.marks = SqlMarkGateway(engine, clock)
        muse_lane.register(
            container, hooks, scheduler, engine=engine, client=FakeMuseClient()
        )
        state["container"], state["hooks"] = container, hooks

    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=(registrar,))
    app.dependency_overrides[db.get_session] = session_override
    return app, state


@pytest.fixture
def demo_client(
    engine: Engine,
    world: Session,
    demo_clock: DemoClock,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, dict[str, Any]]]:
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    app, state = boot(engine, demo_clock)
    with TestClient(app) as client:
        client.headers["X-User-Id"] = "ana"
        yield client, state
