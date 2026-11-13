"""One HTTP round trip each for the new social routes."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.main import create_app
from tests.social.world import add_move, build

ANA = {"X-User-Id": "ana"}


@pytest.fixture
def client(engine: Engine, session: Session) -> Iterator[TestClient]:
    build(session)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        yield client


def test_profile_route_and_search_is_not_shadowed(client: TestClient, session):
    add_move(session, "m_bo", "bo", ("ana",))
    found = client.get("/api/v1/users/search?q=dee", headers=ANA)
    assert found.status_code == 200
    assert [(p["user"]["id"], p["mutual_count"]) for p in found.json()] == [("dee", 2)]

    profile = client.get("/api/v1/users/bo", headers=ANA)
    assert profile.status_code == 200
    body = profile.json()
    assert set(body) == {
        "user",
        "username",
        "relation",
        "mutual_count",
        "mutual",
        "friend_count",
        "moves",
    }
    assert (body["relation"], body["friend_count"]) == ("friend", 3)
    assert body["moves"] == [
        {
            "id": "m_bo",
            "text": "bo at Kumo",
            "category": "coffee",
            "mark": {"id": "mk_kumo", "name": "Kumo Matcha"},
            "starts_at": body["moves"][0]["starts_at"],
            "my_status": None,
        }
    ]
    assert '"lat"' not in profile.text and '"lng"' not in profile.text
    assert client.get("/api/v1/users/nobody", headers=ANA).status_code == 404
    client.post("/api/v1/me/blocks", json={"user_id": "bo"}, headers=ANA)
    assert client.get("/api/v1/users/ana", headers={"X-User-Id": "bo"}).status_code == (
        404
    )


def test_suggestions_route(client: TestClient):
    picks = client.get("/api/v1/friends/suggestions?limit=3", headers=ANA)
    assert picks.status_code == 200
    assert [
        (p["user"]["id"], p["mutual_count"], p["relation"]) for p in picks.json()
    ] == [
        ("dee", 2, "none"),
        ("eve", 1, "none"),
        ("fay", 0, "none"),
    ]
    assert len(client.get("/api/v1/friends/suggestions", headers=ANA).json()) == 6
    bad = client.get("/api/v1/friends/suggestions?limit=31", headers=ANA)
    assert bad.status_code == 422


def test_edit_name_verify_and_friend_usernames(client: TestClient):
    renamed = client.patch("/api/v1/me", json={"name": " Ana Maria "}, headers=ANA)
    assert renamed.status_code == 200
    user = renamed.json()["user"]
    assert (user["name"], user["first_name"]) == ("Ana Maria", "Ana")
    assert client.patch("/api/v1/me", json={"name": "  "}, headers=ANA).status_code == (
        422
    )
    long = client.patch("/api/v1/me", json={"name": "x" * 61}, headers=ANA)
    assert long.status_code == 422
    verified = client.post("/api/v1/me/verify", headers=ANA)
    assert verified.json()["user"]["fb_verified"] is True
    assert client.get("/api/v1/me", headers=ANA).json()["user"]["name"] == "Ana Maria"
    friends = client.get("/api/v1/friends", headers={"X-User-Id": "cy"}).json()
    assert {f["user"]["id"]: f["username"] for f in friends} == {
        "ana": None,
        "dee": "deerao",
    }
