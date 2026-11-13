"""Finding people and friend requests."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.main import create_app
from app.services.friends import Blocked, CantFriendYourself, FriendService
from app.tables import Block, Credential, Friendship, User

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)


class Clock:
    def now(self) -> datetime:
        return NOW


class Inbox:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send(self, user_id, type, title, body, data) -> str:
        self.sent.append((user_id, type, title))
        return "n1"


def people(session: Session) -> None:
    for uid, name in [("u_ana", "Ana Lopez"), ("u_bo", "Bo Chen"), ("u_cy", "Cy Ana")]:
        session.add(User(id=uid, name=name, first_name=name.split()[0], created_at=NOW))
    session.flush()
    session.add(
        Credential(user_id="u_bo", username="bochen", password_hash="x", created_at=NOW)
    )
    session.commit()


@pytest.fixture
def inbox() -> Inbox:
    return Inbox()


@pytest.fixture
def friends(session: Session, inbox: Inbox) -> FriendService:
    people(session)
    return FriendService(session, Clock(), inbox)


def test_search_by_name_or_username_without_yourself(friends):
    assert [p.user.id for p in friends.search("u_ana", "ana")] == ["u_cy"]
    found = friends.search("u_ana", "@boc")
    assert [(p.user.id, p.username, p.relation) for p in found] == [
        ("u_bo", "bochen", "none")
    ]
    assert friends.search("u_ana", "  ") == []


def test_search_hides_blocks_both_ways(friends, session):
    session.add(Block(user_id="u_bo", hidden_from_user_id="u_ana"))
    session.commit()
    assert friends.search("u_ana", "bo") == []


@pytest.mark.anyio
async def test_request_then_accept_makes_friends_and_tells_both(
    friends, inbox, session
):
    assert await friends.request("u_ana", "u_bo") == "outgoing"
    assert await friends.request("u_ana", "u_bo") == "outgoing"  # idempotent
    assert friends.relation("u_bo", "u_ana") == "incoming"
    incoming, _ = friends.requests("u_bo")
    assert [p.user.id for p in incoming] == ["u_ana"]
    assert await friends.accept("u_bo", "u_ana") == "friend"
    assert session.get(Friendship, ("u_ana", "u_bo")) is not None
    assert [(u, t) for u, t, _ in inbox.sent] == [
        ("u_bo", "friend_request"),
        ("u_ana", "friend_accepted"),
    ]
    assert friends.requests("u_bo") == ([], [])


@pytest.mark.anyio
async def test_asking_someone_who_asked_you_accepts(friends):
    await friends.request("u_ana", "u_bo")
    assert await friends.request("u_bo", "u_ana") == "friend"


@pytest.mark.anyio
async def test_decline_cancel_and_unfriend(friends):
    await friends.request("u_ana", "u_bo")
    friends.decline("u_bo", "u_ana")
    assert friends.relation("u_ana", "u_bo") == "none"
    await friends.request("u_ana", "u_bo")
    friends.decline("u_ana", "u_bo")  # cancel your own
    assert friends.relation("u_ana", "u_bo") == "none"
    await friends.request("u_ana", "u_bo")
    await friends.accept("u_bo", "u_ana")
    friends.unfriend("u_ana", "u_bo")
    assert friends.relation("u_ana", "u_bo") == "none"


@pytest.mark.anyio
async def test_cannot_add_yourself_or_someone_who_blocked_you(friends, session):
    with pytest.raises(CantFriendYourself):
        await friends.request("u_ana", "u_ana")
    session.add(Block(user_id="u_bo", hidden_from_user_id="u_ana"))
    session.commit()
    with pytest.raises(Blocked):
        await friends.request("u_ana", "u_bo")


def test_http_search_request_accept(engine: Engine, session: Session):
    people(session)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    ana, bo = {"X-User-Id": "u_ana"}, {"X-User-Id": "u_bo"}
    with TestClient(app) as client:
        assert client.get("/api/v1/users/search?q=bo").status_code == 401
        found = client.get("/api/v1/users/search?q=bo", headers=ana).json()
        assert found[0]["user"]["id"] == "u_bo" and found[0]["relation"] == "none"
        sent = client.post(
            "/api/v1/friends/requests", json={"user_id": "u_bo"}, headers=ana
        )
        assert sent.json() == {"relation": "outgoing"}
        reqs = client.get("/api/v1/friends/requests", headers=bo).json()
        assert [r["user"]["id"] for r in reqs["incoming"]] == ["u_ana"]
        ok = client.post("/api/v1/friends/requests/u_ana/accept", headers=bo)
        assert ok.json() == {"relation": "friend"}
        assert client.delete("/api/v1/friends/u_ana", headers=bo).status_code == 204
        missing = client.post(
            "/api/v1/friends/requests", json={"user_id": "nope"}, headers=ana
        )
        assert missing.status_code == 404
