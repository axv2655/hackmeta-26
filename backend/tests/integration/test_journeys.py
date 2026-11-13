"""The demo journeys end to end over HTTP, with every lane wired.

One app on the in-memory test engine: the real core gateways, the surfaces
lane (proximity, calendar, hangouts), the muse lane on FakeMuseClient (so every
agent takes its heuristic path, as it does with no MUSE_API_KEY), and DEMO_MODE
on so Demo Control stands in for the other people. Nothing here touches
DATABASE_URL.
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
from app.core.gateways import SqlMarkGateway, SqlMoveGateway, SqlUserGateway
from app.lanes import muse as muse_lane
from app.lanes import surfaces as surfaces_lane
from app.main import create_app
from app.muse.client import FakeMuseClient
from app.seed import ids
from app.services import examples
from app.tables import Friendship, Mark, User, UserSettings
from tests.core.fakes import FixedClock, RecordingPublisher

API = "/api/v1"
T0 = datetime(2026, 11, 12, 15, 0, tzinfo=UTC)
CAST = {ids.ANISH: "Anish", ids.PRIYA: "Priya", ids.TONY: "Tony"}
KUMO = ids.KUMO_MATCHA


@pytest.fixture
def world(session: Session) -> Session:
    for uid, first in CAST.items():
        session.add(User(id=uid, name=f"{first} X", first_name=first, created_at=T0))
        session.add(UserSettings(user_id=uid))
    session.add(
        Mark(
            id=KUMO,
            name="Kumo Matcha",
            category="coffee",
            lat=30.28,
            lng=-97.74,
            address="1 Guadalupe St",
        )
    )
    pairs = [(ids.ANISH, ids.PRIYA), (ids.ANISH, ids.TONY), (ids.PRIYA, ids.TONY)]
    session.add_all(
        Friendship(user_a=min(a, b), user_b=max(a, b), since=T0) for a, b in pairs
    )
    session.commit()
    return session


def boot(engine: Engine) -> Any:
    clock = DemoClock(FixedClock(T0))

    def registrar(container, hooks, scheduler) -> None:
        container.clock = clock
        container.time_control = clock
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
    return app


@pytest.fixture
def client(
    engine: Engine, world: Session, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    examples.release_all()
    with TestClient(boot(engine)) as c:
        yield c
    examples.release_all()


def as_(user_id: str) -> dict[str, str]:
    return {"X-User-Id": user_id}


def ok(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def notifications(client: TestClient, user_id: str, kind: str) -> list[dict]:
    rows = ok(client.get(f"{API}/notifications", headers=as_(user_id)))
    return [n for n in rows if n["type"] == kind]


def signup_and_befriend(client: TestClient) -> str:
    body = {"name": "Jamie Rivera", "username": "jamie", "password": "pullup123"}
    me = ok(client.post(f"{API}/auth/signup", json=body), 201)["user"]["id"]
    incoming = ok(client.get(f"{API}/friends/requests", headers=as_(me)))["incoming"]
    assert sorted(p["user"]["id"] for p in incoming) == sorted(CAST)
    assert ok(client.get(f"{API}/friends", headers=as_(me))) == []
    for uid in CAST:
        accepted = client.post(f"{API}/friends/requests/{uid}/accept", headers=as_(me))
        assert ok(accepted) == {"relation": "friend"}
    friends = ok(client.get(f"{API}/friends", headers=as_(me)))
    assert sorted(f["user"]["id"] for f in friends) == sorted(CAST)
    return me


def friend_move(client: TestClient, me: str, user_id: str = ids.TONY) -> str:
    body = {"user_id": user_id, "mark_id": KUMO, "text": "matcha run"}
    response = client.post(f"{API}/demo/friend-move", json=body, headers=as_(me))
    return ok(response)["move_id"]


def rate_kumo(client: TestClient, me: str, move_id: str) -> None:
    rating = f"{API}/moves/{move_id}/rating"
    questions = ok(client.get(f"{rating}/questions", headers=as_(me)))
    assert questions["mark"]["id"] == KUMO and questions["already_rated"] is False
    answers: list[dict[str, str]] = []
    nxt = questions["first_comparison"]
    while nxt is not None:
        answers.append({"other_mark_id": nxt["id"], "preferred": "this"})
        step = client.post(f"{rating}/next", json={"answers": answers}, headers=as_(me))
        nxt = ok(step)["next_comparison"]
    body = {"face": "loved", "answers": answers, "vibe_tags": ["quiet"], "note": ""}
    result = ok(client.post(rating, json=body, headers=as_(me)))
    assert result["mark"]["id"] == KUMO and result["position"] == 1
    assert 7.0 <= result["score"] <= 10.0
    my_list = ok(client.get(f"{API}/leaderboards/my-list", headers=as_(me)))
    assert [row["mark"]["id"] for row in my_list] == [KUMO]


def test_new_user_day(client: TestClient) -> None:
    me = signup_and_befriend(client)

    move_id = friend_move(client, me)
    nudges = [n for n in notifications(client, me, "move_nudge")]
    assert [n["data"]["move_id"] for n in nudges] == [move_id]
    assert nudges[0]["data"]["route"] == f"/move/{move_id}"

    ok(client.post(f"{API}/moves/{move_id}/join", headers=as_(me)))
    arrived = ok(client.post(f"{API}/moves/{move_id}/arrive", headers=as_(me)))
    assert arrived["my_status"] == "there"
    ended = ok(client.post(f"{API}/moves/{move_id}/end", headers=as_(ids.TONY)))
    assert ended["status"] == "ended"
    for uid in (me, ids.TONY):
        prompts = notifications(client, uid, "rate_move")
        assert [n["data"]["route"] for n in prompts] == [f"/move/{move_id}/rate"]

    rate_kumo(client, me, move_id)

    scan = ok(client.post(f"{API}/demo/flare-scan", json={}, headers=as_(me)))
    suggestion = scan["suggestion"]
    assert suggestion is not None and suggestion["type"] == "flare"
    assert suggestion["draft"]["source"] == "heuristic"
    assert 5 <= suggestion["fill_minutes"] <= 10
    assert 5 <= suggestion["draft"]["fill_minutes"] <= 10

    accept = f"{API}/suggestions/{suggestion['id']}/accept"
    accepted = ok(client.post(accept, json={}, headers=as_(me)))
    assert accepted["suggestion"]["status"] == "accepted"
    flare = ok(client.get(f"{API}/moves/{accepted['move_id']}", headers=as_(me)))
    assert flare["kind"] == "flare" and flare["fill_deadline"] is not None
    assert flare["creator"]["id"] == me


def ghosts_for(client: TestClient, me: str, move_id: str) -> list[dict]:
    detail = ok(client.get(f"{API}/marks/{KUMO}", headers=as_(me)))
    return [g for g in detail["ghosts"] if g["move_id"] == move_id]


def friend_there_then_leave(
    client: TestClient, me: str, *, quiet: bool
) -> tuple[str, dict]:
    move_id = friend_move(client, me)
    join = {"user_id": ids.PRIYA, "move_id": move_id, "status": "there"}
    joined = ok(client.post(f"{API}/demo/friend-join", json=join, headers=as_(me)))
    assert joined["status"] == "there"
    leave = {"user_id": ids.PRIYA, "move_id": move_id, "quiet": quiet}
    left = client.post(f"{API}/demo/friend-leave", json=leave, headers=as_(me))
    return move_id, ok(left)


def test_a_friend_who_leaves_leaves_a_ghost(client: TestClient) -> None:
    move_id, left = friend_there_then_leave(client, ids.ANISH, quiet=False)
    assert left["my_status"] == "left"
    ghosts = ghosts_for(client, ids.ANISH, move_id)
    assert [g["user"]["id"] for g in ghosts] == [ids.PRIYA]
    assert ghosts[0]["text"] == "matcha run"


def test_a_quiet_leave_leaves_no_ghost(client: TestClient) -> None:
    move_id, left = friend_there_then_leave(client, ids.ANISH, quiet=True)
    assert left["my_status"] is None
    assert ghosts_for(client, ids.ANISH, move_id) == []
