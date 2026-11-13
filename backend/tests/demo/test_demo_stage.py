"""The extra Demo Control triggers (routes/demo_stage.py) over HTTP, on the
small demo world: ana is the phone, tony is her friend, bo is tony's friend."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.tables import (
    FriendRequest,
    Moment,
    MomentTag,
    MoveParticipant,
    Notification,
    Suggestion,
)
from tests.demo.conftest import KUMO

API = "/api/v1/demo"
Client = tuple[TestClient, dict[str, Any]]


def notifications(engine: Engine, user_id: str, type_: str) -> list[Notification]:
    with Session(engine) as s:
        rows = s.exec(select(Notification).where(Notification.user_id == user_id))
        return [n for n in rows if n.type == type_]


def ana_move(client: TestClient) -> str:
    body = {
        "mark_id": KUMO,
        "text": "matcha",
        "category": "coffee",
        "user_ids": ["tony"],
    }
    response = client.post("/api/v1/moves", json=body)
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def test_friend_request_from_a_stranger_notifies_me(demo_client: Client, engine):
    client, _ = demo_client
    response = client.post(f"{API}/friend-request", json={})
    assert response.json() == {"user_id": "bo", "relation": "outgoing"}
    with Session(engine) as s:
        assert s.get(FriendRequest, ("bo", "ana")) is not None
    assert notifications(engine, "ana", "friend_request")


def test_friend_request_from_a_friend_is_a_conflict(demo_client: Client):
    client, _ = demo_client
    response = client.post(f"{API}/friend-request", json={"user_id": "tony"})
    assert response.status_code == 409


def test_moment_tags_me_and_asks_for_approval(demo_client: Client, engine):
    client, _ = demo_client
    move_id = ana_move(client)
    response = client.post(f"{API}/moment", json={"user_id": "tony"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["move_id"] == move_id
    with Session(engine) as s:
        moment = s.get(Moment, body["moment_id"])
        assert moment.author_id == "tony" and moment.status == "pending"
        assert s.get(MomentTag, (moment.id, "ana")) is not None
        tony = s.get(MoveParticipant, (move_id, "tony"))
        assert tony is not None and tony.arrived_at is not None
    assert notifications(engine, "ana", "moment_approval")


def test_moment_without_a_live_move_is_404(demo_client: Client):
    client, _ = demo_client
    assert client.post(f"{API}/moment", json={"user_id": "tony"}).status_code == 404


def test_route_offers_me_a_ride_with_a_friend(demo_client: Client, engine):
    client, _ = demo_client
    response = client.post(
        f"{API}/route", json={"user_id": "tony", "companion_id": "bo"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["companion_id"] == "bo"
    assert body["suggestion"]["type"] == "route"
    with Session(engine) as s:
        rows = s.exec(select(Suggestion).where(Suggestion.user_id == "ana")).all()
        assert [r.type for r in rows] == ["route"]
        going = s.exec(
            select(MoveParticipant).where(MoveParticipant.move_id == body["move_id"])
        ).all()
        assert {"ana", "bo"} <= {p.user_id for p in going}


def test_route_needs_a_shared_friend(demo_client: Client):
    client, _ = demo_client
    assert client.post(f"{API}/route", json={"user_id": "tony"}).status_code == 409


def test_muse_mode_flips_and_reset_restores_it(demo_client: Client):
    client, state = demo_client
    runner = state["container"].muse.runner
    on = client.post(f"{API}/muse-mode", json={"live": False}).json()
    assert on == {"deterministic": True} and runner.deterministic is True
    assert client.get(f"{API}/state").json()["muse"]["deterministic"] is True
    off = client.post(f"{API}/muse-mode", json={"live": True}).json()
    assert off == {"deterministic": False}
    client.post(f"{API}/muse-mode", json={"live": False})
    client.post(f"{API}/reset")
    assert runner.deterministic is settings.MUSE_DETERMINISTIC


def test_jobs_list_and_run_now(demo_client: Client):
    client, _ = demo_client
    jobs = client.get(f"{API}/jobs").json()["jobs"]
    assert "muse_expire_suggestions" in jobs
    ran = client.post(f"{API}/jobs/muse_expire_suggestions")
    assert ran.status_code == 200 and ran.json()["name"] == "muse_expire_suggestions"
    assert client.post(f"{API}/jobs/nope").status_code == 404


def test_notify_test_reaches_me(demo_client: Client, engine):
    client, _ = demo_client
    response = client.post(f"{API}/notify-test")
    assert response.status_code == 200
    assert notifications(engine, "ana", "move_nudge")
