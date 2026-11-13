"""S1/S2 (simulated): co-presence gateway, sweep, prompt accept, /demo/copresence,
purge, and the notify pipeline's co-present skip (spec 17.3)."""

import asyncio
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.core.config import settings
from app.core.gateways import SqlMoveGateway
from app.hooks import Hooks
from app.main import create_app
from app.ports import MoveCreate
from app.services.proximity_sweep import (
    ProximitySweep,
    SqlProximityGateway,
    join_names,
    purge,
)
from app.tables import (
    AutojoinPref,
    Copresence,
    Friendship,
    Mark,
    MoveParticipant,
    Notification,
    ProximitySighting,
    User,
    UserSettings,
)

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
PEOPLE = ("anish", "maya", "sam", "zed", "nia")


# --- Local helpers (shared surfaces helpers are read-only) ------------------


class Clock:
    def __init__(self, now: datetime) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current


class Publisher:
    def __init__(self) -> None:
        self.published: list[tuple[frozenset[str], str, dict[str, Any]]] = []

    async def publish(
        self, user_ids: Iterable[str], type: str, data: dict[str, Any]
    ) -> None:
        self.published.append((frozenset(user_ids), type, data))

    def prompts(self) -> dict[str, dict[str, Any]]:
        return {
            next(iter(users)): data
            for users, t, data in self.published
            if t == "proximity.prompt"
        }


class Notifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str, str, dict[str, str]]] = []

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        self.sent.append((user_id, type, title, body, data))
        return f"n{len(self.sent)}"


def pair(session: Session, a: str, b: str, last_seen: datetime) -> None:
    x, y = sorted((a, b))
    session.add(Copresence(user_a=x, user_b=y, first_seen=T0, last_seen=last_seen))


def coordinate_keys(value: Any) -> list[str]:
    if isinstance(value, list):
        return [k for v in value for k in coordinate_keys(v)]
    if not isinstance(value, dict):
        return []
    found = [k for k in value if k in {"lat", "lng"}]
    return found + [k for v in value.values() for k in coordinate_keys(v)]


@pytest.fixture
def clock() -> Clock:
    return Clock(T0)


@pytest.fixture
def world(session: Session) -> Session:
    """anish is friends with everyone except nia; maya and sam are friends."""
    for uid in PEOPLE:
        name = uid.title()
        session.add(User(id=uid, name=f"{name} T", first_name=name, created_at=T0))
        session.add(UserSettings(user_id=uid))
    for other in ("maya", "sam", "zed"):
        a, b = sorted(("anish", other))
        session.add(Friendship(user_a=a, user_b=b, since=T0))
    session.add(Friendship(user_a="maya", user_b="sam", since=T0))
    session.add(Mark(id="kumo", name="Kumo", category="coffee", lat=30.28, lng=-97.74))
    session.commit()
    return session


@pytest.fixture
def ports(engine: Engine, clock: Clock) -> dict[str, Any]:
    events = Publisher()
    return {
        "events": events,
        "notifier": Notifier(),
        "moves": SqlMoveGateway(engine, clock, events, Hooks()),
        "proximity": SqlProximityGateway(engine, clock),
    }


def post_move(ports: dict[str, Any], audience: tuple[str, ...]) -> str:
    draft = MoveCreate(
        mark_id="kumo",
        text="matcha run",
        category="coffee",
        user_ids=audience,
        creator_there=True,
    )
    return asyncio.run(ports["moves"].create("anish", draft)).id


def participant(session: Session, move_id: str, uid: str) -> MoveParticipant | None:
    session.expire_all()
    return session.get(MoveParticipant, (move_id, uid))


# --- Gateway -----------------------------------------------------------------


def test_cluster_counts_fresh_and_future_rows_but_not_stale(engine, world, clock):
    pair(world, "anish", "maya", T0 - timedelta(seconds=30))
    pair(world, "maya", "sam", T0 + timedelta(hours=2))  # demo hold
    pair(world, "anish", "zed", T0 - timedelta(minutes=5))  # stale
    world.commit()
    gateway = SqlProximityGateway(engine, clock)
    assert gateway.copresent_cluster("anish") == {"maya", "sam"}
    assert gateway.copresent_cluster("zed") == frozenset()
    assert gateway.open_moves_near("anish") == []


def test_join_names():
    assert join_names(["Anish"]) == "Anish"
    assert join_names(["Anish", "Maya"]) == "Anish and Maya"
    assert join_names(["Anish", "Maya", "Sam"]) == "Anish, Maya and Sam"


# --- Sweep -------------------------------------------------------------------


def test_sweep_prompts_or_auto_joins_and_skips_non_audience(engine, world, ports):
    move_id = post_move(ports, ("maya", "sam"))  # zed is a friend, not audience
    for other in ("maya", "sam", "zed"):
        pair(world, "anish", other, T0 + timedelta(hours=2))
    world.add(AutojoinPref(user_id="sam", other_user_id="anish"))
    world.commit()

    result = asyncio.run(ProximitySweep(engine, Container(ports)).sweep(move_id))

    assert result.prompted == ["maya"]
    assert result.auto_joined == ["sam"]
    prompts = ports["events"].prompts()
    assert set(prompts) == {"maya"}
    assert prompts["maya"]["text"] == "You're with Anish, add yourself?"
    assert prompts["maya"]["mark_name"] == "Kumo"
    assert prompts["maya"]["creator"]["first_name"] == "Anish"
    assert coordinate_keys(prompts["maya"]) == []
    sam = participant(world, move_id, "sam")
    assert sam is not None and (sam.status, sam.joined_via) == ("there", "ble_auto")
    assert participant(world, move_id, "maya") is None  # never without a tap
    assert participant(world, move_id, "zed") is None
    [(uid, type_, title, body, data)] = ports["notifier"].sent
    assert (uid, type_, title) == (
        "sam",
        "proximity_added",
        "Added you to Anish's Move",
    )
    assert body == "You're with Anish. Tap to undo."
    assert data == {"move_id": move_id, "route": f"/move/{move_id}", "undo": "leave"}


def test_sweep_without_copresence_does_nothing(engine, world, ports):
    move_id = post_move(ports, ("maya",))
    result = asyncio.run(ProximitySweep(engine, Container(ports)).sweep(move_id))
    assert (result.prompted, result.auto_joined) == ([], [])
    assert ports["events"].prompts() == {}


def test_on_move_created_hook_sweeps(engine, world, ports):
    pair(world, "anish", "maya", T0 + timedelta(hours=2))
    world.commit()
    move_id = post_move(ports, ("maya",))
    asyncio.run(ProximitySweep(engine, Container(ports)).on_move_created(move_id))
    assert set(ports["events"].prompts()) == {"maya"}


class Container:
    """Just the ports the sweep reads."""

    def __init__(self, ports: dict[str, Any]) -> None:
        for name, port in ports.items():
            setattr(self, name, port)


# --- Purge -------------------------------------------------------------------


def test_purge_drops_old_sightings_and_stale_pairs(engine, world, clock):
    world.add_all(
        [
            ProximitySighting(
                observer_id="anish", observed_id="maya", rssi=-50, seen_at=T0
            ),
            ProximitySighting(
                observer_id="anish",
                observed_id="maya",
                rssi=-50,
                seen_at=T0 - timedelta(hours=3),
            ),
        ]
    )
    pair(world, "anish", "maya", T0 - timedelta(minutes=5))
    pair(world, "anish", "sam", T0 + timedelta(hours=2))
    world.commit()
    assert purge(engine, clock) == 2
    world.expire_all()
    assert len(world.exec(select(ProximitySighting)).all()) == 1
    assert [(r.user_a, r.user_b) for r in world.exec(select(Copresence))] == [
        ("anish", "sam")
    ]


# --- HTTP --------------------------------------------------------------------


@pytest.fixture
def client(engine: Engine, world: Session, ports: dict[str, Any], clock: Clock):
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        container = app.state.container
        container.clock = clock
        for name, port in ports.items():
            setattr(container, name, port)
        yield client


def as_(uid: str) -> dict[str, str]:
    return {"X-User-Id": uid}


def test_accept_joins_there_and_always_writes_autojoin(client, world, ports):
    move_id = post_move(ports, ("maya", "sam", "nia"))
    url = f"/api/v1/proximity/prompt/{move_id}/accept"
    assert client.post(url, headers=as_("nia")).status_code == 200  # not a friend

    response = client.post(url, json={"always": True}, headers=as_("maya"))

    assert response.status_code == 200, response.text
    assert response.json() == {"move_id": move_id, "status": "there"}
    maya = participant(world, move_id, "maya")
    assert maya is not None and (maya.status, maya.joined_via) == (
        "there",
        "ble_prompt",
    )
    prefs = world.exec(select(AutojoinPref).where(AutojoinPref.user_id == "maya"))
    assert {p.other_user_id for p in prefs} == {"anish"}  # nia is not a friend


def test_accept_is_404_when_not_visible_and_409_when_ended(client, ports):
    move_id = post_move(ports, ("maya",))
    url = f"/api/v1/proximity/prompt/{move_id}/accept"
    assert client.post(url, headers=as_("zed")).status_code == 404
    assert client.post("/api/v1/proximity/prompt/nope/accept").status_code == 401
    asyncio.run(ports["moves"].end(move_id, "creator"))
    assert client.post(url, headers=as_("maya")).status_code == 409


def test_demo_copresence_is_404_without_demo_mode(client):
    body = {"user_ids": ["anish", "maya"], "on": True}
    response = client.post("/api/v1/demo/copresence", json=body, headers=as_("anish"))
    assert response.status_code == 404


def test_demo_copresence_pairs_friends_and_sweeps(client, world, ports, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    move_id = post_move(ports, ("maya", "sam"))
    world.add(AutojoinPref(user_id="sam", other_user_id="anish"))
    world.commit()
    url = "/api/v1/demo/copresence"

    short = client.post(url, json={"user_ids": ["anish"], "on": True})
    assert short.status_code == 422
    body = {"user_ids": ["anish", "maya", "sam", "nia"], "on": True}
    response = client.post(url, json=body, headers=as_("anish"))

    assert response.status_code == 200, response.text
    # anish-maya, anish-sam, maya-sam; nia is nobody's friend here
    assert response.json() == {"pairs": 3, "prompted": ["maya"], "auto_joined": ["sam"]}
    assert participant(world, move_id, "sam").joined_via == "ble_auto"
    rows = world.exec(select(Copresence)).all()
    assert all(r.last_seen == T0 + timedelta(hours=2) for r in rows)

    off = client.post(url, json={**body, "on": False}, headers=as_("anish"))
    assert off.json() == {"pairs": 3, "prompted": [], "auto_joined": []}
    world.expire_all()
    assert world.exec(select(Copresence)).all() == []


# --- Notify pipeline skips the co-present cluster (17.3) ---------------------


def test_notify_pipeline_skips_copresent_friends(engine, session, clock):
    from tests.muse import factories as f
    from tests.muse.factories import move_snap
    from tests.muse.fakes import FakeMoveGateway, RecordingPublisher

    f.users(session, "tony", "priya", "riley")
    f.mark_row(session, "kumo", name="Kumo")
    pair(session, "tony", "priya", T0 + timedelta(hours=2))
    session.commit()
    moves = FakeMoveGateway(clock)
    # priya is co-present with tony but not with riley.
    moves.put(move_snap("mv1", "tony"), {"priya"})
    moves.put(move_snap("mv2", "riley"), {"priya"})
    _, hooks, _, _ = f.wire(
        engine,
        clock,
        moves=moves,
        events=RecordingPublisher(),
        proximity=SqlProximityGateway(engine, clock),
    )

    asyncio.run(hooks.on_move_created.fire("mv1"))
    asyncio.run(hooks.on_move_created.fire("mv2"))

    session.expire_all()
    rows = session.exec(
        select(Notification).where(Notification.type == "move_nudge")
    ).all()
    assert [(n.user_id, n.data["move_id"]) for n in rows] == [("priya", "mv2")]
