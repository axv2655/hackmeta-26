"""Demo Control over HTTP (ARCHITECTURE.md 15.2), in DEMO_MODE on the test
engine with the real core gateways and the muse lane on FakeMuseClient."""

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.core.config import settings
from app.seed import ids
from app.services import examples
from app.tables import (
    CalendarEvent,
    FriendRequest,
    Friendship,
    Move,
    MoveParticipant,
    Notification,
)
from tests.demo.conftest import KUMO, T0, boot

API = "/api/v1/demo"
ROUTES = (
    ("GET", "/state"),
    ("POST", "/time"),
    ("POST", "/reset"),
    ("POST", "/flare-scan"),
    ("POST", "/free-time"),
    ("POST", "/revive-scan"),
    ("POST", "/friend-move"),
    ("POST", "/friend-join"),
    ("POST", "/friend-leave"),
    ("POST", "/friend-accept"),
    ("POST", "/end-move"),
    ("POST", "/nobody-bit"),
    ("GET", "/muse-stats"),
)

Client = tuple[TestClient, dict[str, Any]]


@pytest.fixture(autouse=True)
def _no_holds():
    examples.release_all()
    yield
    examples.release_all()


def friend_move(client: TestClient, **fields: Any) -> str:
    body = {"user_id": "tony", "mark_id": KUMO, "text": "matcha run"} | fields
    response = client.post(f"{API}/friend-move", json=body)
    assert response.status_code == 200, response.text
    return response.json()["move_id"]


def test_every_demo_route_is_404_without_demo_mode(
    engine: Engine, world: Session, demo_clock
):
    assert settings.DEMO_MODE is None  # pinned by tests/conftest.py
    app, _ = boot(engine, demo_clock)
    with TestClient(app) as client:
        for method, path in ROUTES:
            response = client.request(
                method, API + path, json={}, headers={"X-User-Id": "ana"}
            )
            assert response.status_code == 404, (method, path)


def test_time_shifts_and_resets_the_clock(demo_client: Client):
    client, state = demo_client
    shifted = client.post(f"{API}/time", json={"offset_minutes": 90}).json()
    assert shifted["offset_minutes"] == 90
    assert state["container"].clock.now() == T0 + timedelta(minutes=90)
    jumped = client.post(f"{API}/time", json={"iso": "2026-11-12T20:00:00Z"}).json()
    assert jumped["offset_minutes"] == 360
    assert client.get(f"{API}/state").json()["offset_minutes"] == 360
    back = client.post(f"{API}/time", json={"reset": True}).json()
    assert back["offset_minutes"] == 0


def test_state_reports_demo_mode_and_fake_muse(demo_client: Client):
    client, _ = demo_client
    body = client.get(f"{API}/state").json()
    assert body["demo_mode"] == "on" and body["user_id"] == "ana"
    assert body["muse"] == {"client": "fake", "live": False}


def test_end_move_fires_the_hook_and_holds_examples(
    demo_client: Client, engine: Engine
):
    client, state = demo_client
    ended: list[str] = []
    state["hooks"].on_move_ended.register(ended.append)
    move_id = friend_move(client)
    with Session(engine) as s:
        s.add(
            Move(
                id=ids.MOVE_PRIYA_SQUARE,
                creator_id="tony",
                mark_id=KUMO,
                text="walk",
                category="outdoors",
                starts_at=T0,
                created_at=T0,
            )
        )
        s.commit()

    for mid in (move_id, ids.MOVE_PRIYA_SQUARE):
        response = client.post(f"{API}/end-move", json={"move_id": mid})
        assert response.json() == {"move_id": mid, "status": "ended"}
    assert ended == [move_id, ids.MOVE_PRIYA_SQUARE]
    assert examples.held() == frozenset({ids.MOVE_PRIYA_SQUARE})
    with Session(engine) as s:
        assert s.get(Move, move_id).status == "ended"


class NoneMuse:
    async def run_flare_scan(self, user_id: str):
        return None

    def muse_stats(self) -> dict[str, Any]:
        return {}


def test_flare_scan_writes_a_block_and_a_45_minute_window(
    demo_client: Client, engine: Engine
):
    client, state = demo_client
    state["container"].muse = NoneMuse()
    response = client.post(f"{API}/flare-scan", json={})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["suggestion"] is None
    assert abs(body["window"]["minutes"] - 45) <= 1
    with Session(engine) as s:
        blocks = s.exec(
            select(CalendarEvent).where(col(CalendarEvent.location) == "demo")
        ).all()
    assert [(b.user_id, b.title) for b in blocks] == [("ana", "CS 4349 lecture")]
    assert blocks[0].ends_at - blocks[0].starts_at == timedelta(minutes=75)
    # A second scan replaces the block instead of stacking another.
    client.post(f"{API}/flare-scan", json={"window_minutes": 30})
    with Session(engine) as s:
        rows = s.exec(select(CalendarEvent)).all()
    assert len(rows) == 1


def test_flare_scan_clears_phone_blocks_inside_the_staged_gap(
    demo_client: Client, engine: Engine
):
    """A real meeting synced from the presenter's phone must not hide the gap;
    phone blocks after the staged lecture are left alone."""
    client, state = demo_client
    state["container"].muse = NoneMuse()
    now = state["container"].clock.now()
    with Session(engine) as s:
        s.add(
            CalendarEvent(
                user_id="ana",
                starts_at=now + timedelta(minutes=10),
                ends_at=now + timedelta(minutes=40),
            )
        )
        s.add(
            CalendarEvent(
                user_id="ana",
                starts_at=now + timedelta(hours=5),
                ends_at=now + timedelta(hours=6),
            )
        )
        s.commit()
    body = client.post(f"{API}/flare-scan", json={}).json()
    assert abs(body["window"]["minutes"] - 45) <= 1
    with Session(engine) as s:
        phone = s.exec(
            select(CalendarEvent).where(col(CalendarEvent.title).is_(None))
        ).all()
    assert [b.starts_at - now for b in phone] == [timedelta(hours=5)]


def test_friend_move_reaches_friends_and_nudges_the_caller(
    demo_client: Client, engine: Engine
):
    client, _ = demo_client
    move_id = friend_move(client)
    with Session(engine) as s:
        move = s.get(Move, move_id)
        assert move.creator_id == "tony" and move.category == "coffee"
        nudges = s.exec(
            select(Notification).where(col(Notification.type) == "move_nudge")
        ).all()
    assert [n.user_id for n in nudges] == ["ana"]
    assert (
        client.get(f"/api/v1/moves/{move_id}", headers={"X-User-Id": "bo"}).status_code
        == 200
    )


def test_friend_move_404s_for_an_unknown_user_or_mark(demo_client: Client):
    client, _ = demo_client
    nobody = {"user_id": "nobody", "mark_id": KUMO, "text": "x"}
    assert client.post(f"{API}/friend-move", json=nobody).status_code == 404
    no_mark = {"user_id": "tony", "mark_id": "mk_nope", "text": "x"}
    assert client.post(f"{API}/friend-move", json=no_mark).status_code == 404


def test_friend_accept_makes_a_friendship(demo_client: Client, engine: Engine):
    client, _ = demo_client
    with Session(engine) as s:
        s.add(FriendRequest(from_id="ana", to_id="bo", created_at=T0))
        s.commit()
    response = client.post(f"{API}/friend-accept", json={"user_id": "bo"})
    assert response.json() == {"relation": "friend"}
    with Session(engine) as s:
        assert s.get(Friendship, ("ana", "bo")) is not None
        assert s.get(FriendRequest, ("ana", "bo")) is None
    again = client.post(f"{API}/friend-accept", json={"user_id": "bo"})
    assert again.json() == {"relation": "friend"}


def test_friend_accept_404s_with_no_pending_request(demo_client: Client):
    client, _ = demo_client
    response = client.post(f"{API}/friend-accept", json={"user_id": "bo"})
    assert response.status_code == 404


def test_friend_join_then_leave_leaves_a_ghost(demo_client: Client, engine: Engine):
    client, _ = demo_client
    move_id = friend_move(client, user_id="tony")
    joined = client.post(
        f"{API}/friend-join",
        json={"user_id": "bo", "move_id": move_id, "status": "there"},
    )
    assert joined.json() == {"move_id": move_id, "status": "there"}
    left = client.post(
        f"{API}/friend-leave", json={"user_id": "bo", "move_id": move_id}
    )
    assert left.json() == {"move_id": move_id, "my_status": "left"}
    with Session(engine) as s:
        row = s.get(MoveParticipant, (move_id, "bo"))
        assert row is not None and row.status == "left"
    detail = client.get(f"/api/v1/marks/{KUMO}", headers={"X-User-Id": "tony"})
    assert detail.status_code == 200, detail.text
    ghosts = detail.json()["ghosts"]
    assert "bo" in {g["user"]["id"] for g in ghosts}


def test_reset_is_soft(demo_client: Client, engine: Engine):
    client, state = demo_client
    client.post(f"{API}/time", json={"offset_minutes": 30})
    state["container"].muse = NoneMuse()
    client.post(f"{API}/flare-scan", json={})
    examples.hold(ids.MOVE_TONY_KUMO)
    body = client.post(f"{API}/reset").json()
    assert body["cleared_blocks"] == 1 and body["refreshed_moves"] == 0
    assert examples.held() == frozenset()
    assert state["container"].clock.now() == T0
    with Session(engine) as s:
        assert len(s.exec(select(Friendship)).all()) == 2  # nothing else removed
