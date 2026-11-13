"""S7: leaderboards service and routes (plan A.6)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.main import create_app
from app.services.leaderboards import LeaderboardService, UnknownCategory
from tests.surfaces.factories import (
    add_block,
    add_friends,
    add_mark,
    add_ranking,
    add_users,
)


@pytest.fixture
def world(session: Session) -> Session:
    add_users(session, ["me", "f1", "f2", "f3", "f4", "stranger", "blocked"])
    add_friends(session, "me", "f1", "f2", "f3", "f4", "blocked")
    add_block(session, "blocked", "me")  # blocked hides their Moves from me
    add_mark(session, "kumo")
    add_mark(session, "blue")
    add_mark(session, "secret")
    add_mark(session, "taco", category="food")
    add_ranking(session, "me", "kumo", 8.0)
    add_ranking(session, "f1", "kumo", 6.0)
    add_ranking(session, "f2", "kumo", 9.0)
    add_ranking(session, "f3", "kumo", 7.0)
    add_ranking(session, "f4", "kumo", 5.0)
    add_ranking(session, "f1", "blue", 9.5)
    add_ranking(session, "stranger", "secret", 10.0)
    add_ranking(session, "blocked", "secret", 10.0)
    add_ranking(session, "blocked", "kumo", 0.0)
    add_ranking(session, "me", "taco", 7.5, category="food")
    session.commit()
    return session


class TestService:
    def test_spots_only_use_viewer_and_unblocked_friends(self, world):
        spots = LeaderboardService(world).spots("me", "coffee")
        assert [s.mark.id for s in spots] == ["blue", "kumo"]
        assert [s.position for s in spots] == [1, 2]
        kumo = spots[1]
        assert kumo.your_score == 8.0
        assert kumo.score == 7.0  # (8 + 6 + 9 + 7 + 5) / 5, blocked 0.0 left out

    def test_rankers_are_top_three_by_score(self, world):
        kumo = LeaderboardService(world).spots("me", "coffee")[1]
        assert [u.id for u in kumo.rankers] == ["f2", "me", "f3"]
        assert all(not hasattr(u, "lat") for u in kumo.rankers)

    def test_category_is_optional(self, world):
        spots = LeaderboardService(world).spots("me", None)
        assert [s.mark.id for s in spots] == ["blue", "taco", "kumo"]

    def test_limit(self, world):
        assert len(LeaderboardService(world).spots("me", None, limit=1)) == 1

    def test_my_list(self, world):
        rows = LeaderboardService(world).my_list("me", None)
        assert [(r.position, r.mark.id, r.category) for r in rows] == [
            (1, "kumo", "coffee"),
            (2, "taco", "food"),
        ]
        assert [r.mark.id for r in LeaderboardService(world).my_list("me", "food")] == [
            "taco"
        ]

    def test_unknown_category(self, world):
        with pytest.raises(UnknownCategory):
            LeaderboardService(world).spots("me", "bowling")
        with pytest.raises(UnknownCategory):
            LeaderboardService(world).my_list("me", "bowling")


@pytest.fixture
def client(engine: Engine, world: Session) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as c:
        yield c


ME = {"X-User-Id": "me"}


def test_http_spots_hide_non_friends_and_blocked(client):
    res = client.get("/api/v1/leaderboards/spots?category=coffee", headers=ME)
    assert res.status_code == 200
    body = res.json()
    assert "secret" not in {s["mark"]["id"] for s in body}
    ranker_ids = {u["id"] for s in body for u in s["rankers"]}
    assert ranker_ids.isdisjoint({"stranger", "blocked"})
    assert body[0]["position"] == 1


def test_http_category_optional_and_unknown_is_422(client):
    assert client.get("/api/v1/leaderboards/spots", headers=ME).status_code == 200
    assert client.get("/api/v1/leaderboards/my-list", headers=ME).status_code == 200
    bad = client.get("/api/v1/leaderboards/spots?category=bowling", headers=ME)
    assert bad.status_code == 422
    bad = client.get("/api/v1/leaderboards/my-list?category=bowling", headers=ME)
    assert bad.status_code == 422
    assert (
        client.get("/api/v1/leaderboards/spots?limit=0", headers=ME).status_code == 422
    )


def test_http_my_list_shape(client):
    rows = client.get("/api/v1/leaderboards/my-list?category=coffee", headers=ME).json()
    assert rows == [
        {
            "position": 1,
            "mark": rows[0]["mark"],
            "score": 8.0,
            "category": "coffee",
        }
    ]
    assert rows[0]["mark"]["id"] == "kumo"
