"""C5: Moves routes, as HTTP round trips with `X-User-Id`."""

import asyncio
from collections.abc import Iterator, Sequence
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.api.routes import moves as moves_routes
from app.core import db
from app.main import create_app
from app.ports import MoveSnapshot, RankedMove
from app.ports_null import NullMuseGateway
from app.tables import Block, Circle, CircleMember, Mark, Moment, User
from app.tables import Move as MoveRow
from tests.core.fakes import FixedClock, RecordingPublisher

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
USERS = ("ana", "bo", "cy", "dee", "mom")
KUMO = (30.28, -97.74)
ACTIONS = ("join", "arrive", "leave", "end")


class FakeRanker:
    """The `rank_moves` slice of `MuseGateway`: returns a fixed ranking, or
    raises / hangs to exercise the fallback."""

    def __init__(self, ranking: Sequence[tuple[str, str]] = ()) -> None:
        self.ranking = list(ranking)
        self.seen: list[list[str]] = []
        self.fail = False
        self.hang = False

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]:
        self.seen.append([m.id for m in moves])
        if self.fail:
            raise RuntimeError("muse is down")
        if self.hang:
            await asyncio.Event().wait()
        return [RankedMove(move_id=i, reason=r) for i, r in self.ranking]


@pytest.fixture
def world(session: Session) -> Session:
    """ana owns Circle "crew" (bo, cy); dee is a stranger; ana blocks mom."""
    session.add_all(
        User(id=u, name=f"{u.title()} X", first_name=u.title(), created_at=T0)
        for u in USERS
    )
    session.add_all(
        [
            Mark(id="kumo", name="Kumo", category="coffee", lat=KUMO[0], lng=KUMO[1]),
            # About 80 km north of Kumo.
            Mark(id="far", name="Far", category="food", lat=31.0, lng=KUMO[1]),
            Circle(id="crew", owner_id="ana", name="Crew"),
            Block(user_id="ana", hidden_from_user_id="mom"),
        ]
    )
    session.add_all(CircleMember(circle_id="crew", user_id=u) for u in ("bo", "cy"))
    session.commit()
    return session


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def ranker() -> FakeRanker:
    return FakeRanker()


@pytest.fixture
def client(
    engine: Engine, world: Session, clock: FixedClock, ranker: FakeRanker
) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        container = app.state.container
        container.clock = clock
        container.events = RecordingPublisher()
        container.muse = ranker
        client.headers["X-User-Id"] = "ana"
        yield client


def as_(user_id: str) -> dict[str, str]:
    return {"X-User-Id": user_id}


def post_move(client: TestClient, **fields: Any) -> dict[str, Any]:
    body = {"mark_id": "kumo", "text": "matcha?", "category": "coffee"}
    body.setdefault("circle_ids", ["crew"])
    response = client.post("/api/v1/moves", json=body | fields)
    assert response.status_code == 201, response.text
    return response.json()


def act(client: TestClient, move_id: str, action: str, user: str = "bo") -> Any:
    return client.post(f"/api/v1/moves/{move_id}/{action}", headers=as_(user))


def feed_ids(client: TestClient, user: str = "ana") -> list[str]:
    response = client.get("/api/v1/moves/feed", headers=as_(user))
    assert response.status_code == 200
    return [m["id"] for m in response.json()]


def coordinate_paths(value: Any, path: str = "") -> list[str]:
    """Every `lat`/`lng` key in a JSON value, as dotted paths."""
    if isinstance(value, list):
        return [p for i, v in enumerate(value) for p in coordinate_paths(v, path)]
    if not isinstance(value, dict):
        return []
    found = [f"{path}.{k}" for k in value if k in {"lat", "lng"}]
    for key, child in value.items():
        found += coordinate_paths(child, f"{path}.{key}")
    return found


# --- auth --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/moves"),
        ("GET", "/api/v1/moves/feed"),
        ("GET", "/api/v1/moves/nearby?lat=30.28&lng=-97.74"),
        ("GET", "/api/v1/moves/m1"),
        *(("POST", f"/api/v1/moves/m1/{action}") for action in ACTIONS),
    ],
)
@pytest.mark.parametrize("user", [None, "ghost"], ids=["missing", "unknown"])
def test_every_route_needs_a_known_user(
    client: TestClient, method: str, path: str, user: str | None
) -> None:
    del client.headers["X-User-Id"]
    headers = {} if user is None else as_(user)
    assert client.request(method, path, headers=headers).status_code == 401


# --- create ------------------------------------------------------------------


def test_create_returns_the_move_with_the_creators_audience(
    client: TestClient, world: Session
) -> None:
    move = post_move(
        client,
        text="  matcha?  ",
        user_ids=["dee", "mom"],
        notify_user_ids=["bo"],
        fill_minutes=10,
        kind="flare",
        creator_there=True,
    )

    assert move["text"] == "matcha?"
    assert move["creator"]["id"] == "ana"
    assert (move["status"], move["kind"], move["open"]) == ("live", "flare", False)
    assert move["starts_at"] == T0.isoformat().replace("+00:00", "Z")
    assert move["fill_deadline"] is not None and move["ends_at"] is None
    assert move["mark"]["id"] == "kumo" and move["mark"]["saved"] is False
    assert [
        (p["user"]["id"], p["status"], p["joined_via"]) for p in move["participants"]
    ] == [("ana", "there", "creator")]
    assert move["my_status"] == "there"
    assert (move["moments_count"], move["muse_reason"]) == (0, None)
    # mom is blocked, so she is neither in the audience nor listed.
    assert move["audience"]["count"] == 3
    assert move["audience"]["circles"] == [{"id": "crew", "name": "Crew"}]
    assert [p["id"] for p in move["audience"]["people"]] == ["bo", "cy", "dee"]

    row = world.get(MoveRow, move["id"])
    assert row is not None and row.notify_user_ids == ["bo"]


def test_only_the_marks_coordinates_are_ever_returned(client: TestClient) -> None:
    move = post_move(client, user_ids=["dee"])
    act(client, move["id"], "join")
    responses = [
        client.get(f"/api/v1/moves/{move['id']}").json(),
        client.get("/api/v1/moves/feed").json(),
        client.get("/api/v1/moves/nearby", params={"lat": 30.28, "lng": -97.74}).json(),
    ]
    for body in responses:
        paths = {p.removeprefix(".") for p in coordinate_paths(body)}
        assert paths == {"mark.lat", "mark.lng"}


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"text": "   "}, 422),
        ({"text": "x" * 281}, 422),
        ({"kind": "flare"}, 422),  # a flare needs a fill window
        ({"fill_minutes": 30}, 422),
        ({"category": "karaoke"}, 422),
        ({"mark_id": "nowhere"}, 404),
    ],
    ids=["blank", "long", "flare", "fill", "category", "mark"],
)
def test_invalid_create_is_rejected(
    client: TestClient, fields: dict[str, Any], code: int
) -> None:
    body = {"mark_id": "kumo", "text": "matcha?", "category": "coffee"} | fields
    response = client.post("/api/v1/moves", json=body)
    assert response.status_code == code
    assert "detail" in response.json()
    assert feed_ids(client) == []


# --- detail and privacy ------------------------------------------------------


def test_audience_member_sees_the_move_without_its_audience(
    client: TestClient,
) -> None:
    move_id = post_move(client)["id"]
    seen = client.get(f"/api/v1/moves/{move_id}", headers=as_("bo")).json()
    assert seen["id"] == move_id
    assert seen["my_status"] is None
    assert seen["audience"] is None


@pytest.mark.parametrize("viewer", ["dee", "mom"], ids=["stranger", "blocked"])
def test_hidden_move_is_404_on_every_route(client: TestClient, viewer: str) -> None:
    move_id = post_move(client, user_ids=["mom"])["id"]

    detail = client.get(f"/api/v1/moves/{move_id}", headers=as_(viewer))
    assert detail.status_code == 404
    for action in ACTIONS:
        assert act(client, move_id, action, viewer).status_code == 404
    assert feed_ids(client, viewer) == []
    nearby = client.get(
        "/api/v1/moves/nearby",
        params={"lat": KUMO[0], "lng": KUMO[1]},
        headers=as_(viewer),
    )
    assert nearby.json() == []


def test_unknown_move_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/moves/nope")
    assert response.status_code == 404
    assert response.json() == {"detail": "move nope not found"}


# --- join, arrive, leave, end ------------------------------------------------


def test_join_arrive_leave_round_trip(client: TestClient) -> None:
    move_id = post_move(client)["id"]

    joined = act(client, move_id, "join").json()
    assert joined["my_status"] == "going"
    assert [p["user"]["id"] for p in joined["participants"]] == ["ana", "bo"]
    assert act(client, move_id, "join").json()["my_status"] == "going"  # idempotent
    assert act(client, move_id, "arrive").json()["my_status"] == "there"
    left = act(client, move_id, "leave").json()
    assert (left["my_status"], left["status"]) == ("left", "live")


def test_rejoin_after_leaving_is_409(client: TestClient) -> None:
    move_id = post_move(client)["id"]
    act(client, move_id, "join")
    act(client, move_id, "leave")
    response = act(client, move_id, "join")
    assert response.status_code == 409
    assert response.json() == {"detail": "cannot go from left to going"}


def test_arrive_or_leave_without_joining_is_409(client: TestClient) -> None:
    move_id = post_move(client)["id"]
    assert act(client, move_id, "arrive").status_code == 409
    assert act(client, move_id, "leave").status_code == 409


def test_last_one_leaving_ends_the_move(client: TestClient) -> None:
    move_id = post_move(client)["id"]
    ended = act(client, move_id, "leave", "ana").json()
    assert ended["status"] == "ended" and ended["ends_at"] is not None


def test_only_the_creator_ends_a_move(client: TestClient) -> None:
    move_id = post_move(client)["id"]
    act(client, move_id, "join")

    assert act(client, move_id, "end", "bo").status_code == 403
    ended = act(client, move_id, "end", "ana")
    assert ended.status_code == 200 and ended.json()["status"] == "ended"
    assert act(client, move_id, "end", "ana").status_code == 409
    assert act(client, move_id, "join", "cy").status_code == 409
    # An ended Move still has a detail page, but leaves the feed.
    assert client.get(f"/api/v1/moves/{move_id}").json()["status"] == "ended"
    assert feed_ids(client) == []


def test_moments_count_follows_moment_visibility(
    client: TestClient, world: Session
) -> None:
    move_id = post_move(client)["id"]
    for i, status in enumerate(("approved", "pending")):
        world.add(
            Moment(
                id=f"mo{i}",
                move_id=move_id,
                mark_id="kumo",
                author_id="ana",
                media_url="x.jpg",
                status=status,
                created_at=T0,
            )
        )
    world.commit()

    assert client.get(f"/api/v1/moves/{move_id}").json()["moments_count"] == 2
    bo = client.get(f"/api/v1/moves/{move_id}", headers=as_("bo")).json()
    assert bo["moments_count"] == 1


# --- feed and nearby ---------------------------------------------------------


@pytest.fixture
def three_moves(client: TestClient, clock: FixedClock) -> list[str]:
    """Three live Moves visible to bo, oldest first; the last is at "far"."""
    ids = []
    for mark_id in ("kumo", "kumo", "far"):
        ids.append(post_move(client, mark_id=mark_id)["id"])
        clock.advance(minutes=1)
    return ids


def test_feed_uses_the_muse_ranking(
    client: TestClient, ranker: FakeRanker, three_moves: list[str]
) -> None:
    old, mid, new = three_moves
    ranker.ranking = [(mid, "Tony is there"), ("hidden-move", "x"), (old, "")]

    feed = client.get("/api/v1/moves/feed", headers=as_("bo")).json()

    # Muse was given the start-time order; its unknown id is dropped and the
    # Move it left out comes last.
    assert ranker.seen == [[new, mid, old]]
    assert [m["id"] for m in feed] == [mid, old, new]
    assert [m["muse_reason"] for m in feed] == ["Tony is there", None, None]


def test_feed_works_with_the_null_muse(
    client: TestClient, three_moves: list[str]
) -> None:
    client.app.state.container.muse = NullMuseGateway()
    assert feed_ids(client, "bo") == three_moves[::-1]


@pytest.mark.parametrize("failure", ["fail", "hang"])
def test_ranking_failure_falls_back_to_start_time(
    client: TestClient,
    ranker: FakeRanker,
    three_moves: list[str],
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    monkeypatch.setattr(moves_routes, "RANK_TIMEOUT_S", 0.01)
    setattr(ranker, failure, True)
    ranker.ranking = [(three_moves[0], "oldest first")]

    feed = client.get("/api/v1/moves/feed", headers=as_("bo")).json()

    assert [m["id"] for m in feed] == three_moves[::-1]
    assert all(m["muse_reason"] is None for m in feed)


def test_nearby_filters_by_mark_distance_and_ranks(
    client: TestClient, ranker: FakeRanker, three_moves: list[str]
) -> None:
    old, mid, _far = three_moves
    ranker.ranking = [(old, "you've been here 4 times")]
    params = {"lat": 30.2801234, "lng": -97.7398765, "radius_km": 2}

    nearby = client.get("/api/v1/moves/nearby", params=params, headers=as_("bo"))

    assert ranker.seen == [[mid, old]]
    assert [m["id"] for m in nearby.json()] == [old, mid]
    assert nearby.json()[0]["muse_reason"] == "you've been here 4 times"
    wide = client.get(
        "/api/v1/moves/nearby", params=params | {"radius_km": 50}, headers=as_("bo")
    )
    assert len(wide.json()) == 2  # "far" is about 80 km away


@pytest.mark.parametrize(
    "params",
    [{"lat": 30.28}, {"lat": 91, "lng": 0}, {"lat": 0, "lng": 0, "radius_km": 0}],
    ids=["missing", "range", "radius"],
)
def test_nearby_validates_its_query(
    client: TestClient, params: dict[str, float]
) -> None:
    assert client.get("/api/v1/moves/nearby", params=params).status_code == 422
