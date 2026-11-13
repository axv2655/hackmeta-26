"""S4: Reels feed, place sheet and save, service-level and over HTTP."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.core.gateways import SqlMarkGateway, SqlMoveGateway
from app.hooks import Hooks
from app.main import create_app
from app.ports import MoveCreate, MoveDraftOut, NotifyPickOut, PlaceResolution
from app.ports_null import NullEventPublisher
from app.services import reels as reels_service
from app.tables import (
    Friendship,
    Mark,
    Reel,
    SavedMark,
    SavedReel,
    User,
    UserSettings,
)

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
KUMO = (37.4860, -122.1490)
HERE = (37.4851234, -122.1481234)
USERS = ("anish", "tony", "priya", "maya")


class FixedClock:
    def __init__(self, now: datetime) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current


class FakeMuse:
    """The `compose_move` / `resolve_place` slice of `MuseGateway`."""

    def __init__(self) -> None:
        self.composed: list[dict[str, Any]] = []
        self.resolved: list[str | None] = []
        self.resolution = PlaceResolution(mark_id=None, confidence=0.0)
        self.fail = False
        self.hang = False

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut:
        self.composed.append({"mark_id": mark_id, "seed": seed_text, "at": coarse})
        if self.fail:
            raise RuntimeError("muse is down")
        if self.hang:
            await asyncio.sleep(5)
        return MoveDraftOut(
            mark_id=mark_id,
            text="getting matcha",
            category="coffee",
            notify=(NotifyPickOut("priya", "matcha?", "you both love Kumo"),),
            source="heuristic",
        )

    async def resolve_place(
        self,
        user_id: str,
        *,
        geotag_mark_id: str | None = None,
        caption: str | None = None,
        coarse: tuple[float, float] | None = None,
        frame_url: str | None = None,
    ) -> PlaceResolution:
        self.resolved.append(caption)
        return self.resolution


@pytest.fixture
def world(session: Session) -> Session:
    """anish is friends with tony and priya; maya is a stranger to him."""
    for uid in USERS:
        session.add(
            User(id=uid, name=f"{uid.title()} X", first_name=uid.title(), created_at=T0)
        )
        session.add(UserSettings(user_id=uid))
    for other in ("tony", "priya"):
        a, b = sorted(("anish", other))
        session.add(Friendship(user_a=a, user_b=b, since=T0))
    session.add_all(
        [
            Mark(id="kumo", name="Kumo", category="coffee", lat=KUMO[0], lng=KUMO[1]),
            Mark(
                id="cafe", name="Quiet Cafe", category="coffee", lat=37.49, lng=-122.15
            ),
            Reel(
                id="rl_b_kumo",
                author_name="Dhivyesh",
                video_url="bundle:reel-kumo",
                thumb_url="bundle:reel-kumo",
                caption="best matcha in town",
                geotag_mark_id="kumo",
                likes=12,
            ),
            Reel(
                id="rl_a_caption",
                author_name="Sam",
                video_url="https://x/v.mp4",
                thumb_url="https://x/t.jpg",
                caption="this quiet cafe is a vibe",
            ),
        ]
    )
    session.commit()
    return session


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def muse() -> FakeMuse:
    return FakeMuse()


@pytest.fixture
def moves(engine: Engine, clock: FixedClock) -> SqlMoveGateway:
    return SqlMoveGateway(engine, clock, NullEventPublisher(), Hooks())


@pytest.fixture
def client(
    engine: Engine,
    world: Session,
    clock: FixedClock,
    muse: FakeMuse,
    moves: SqlMoveGateway,
) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        container = app.state.container
        container.clock = clock
        container.moves = moves
        container.marks = SqlMarkGateway(engine, clock)
        container.muse = muse
        client.headers["X-User-Id"] = "anish"
        yield client


def live_move(moves: SqlMoveGateway, creator: str, audience: tuple[str, ...]) -> str:
    draft = MoveCreate(
        mark_id="kumo", text="matcha run", category="coffee", user_ids=audience
    )
    return asyncio.run(moves.create(creator, draft)).id


def coordinate_paths(value: Any, path: str = "") -> list[str]:
    """Every `lat`/`lng` key in a JSON value, as dotted paths."""
    if isinstance(value, list):
        return [p for v in value for p in coordinate_paths(v, path)]
    if not isinstance(value, dict):
        return []
    found = [f"{path}.{k}" for k in value if k in {"lat", "lng"}]
    for key, child in value.items():
        found += coordinate_paths(child, f"{path}.{key}")
    return found


class TestFeed:
    def test_reels_by_id_with_mark_and_distance(self, client: TestClient) -> None:
        body = client.get("/api/v1/reels", params={"lat": HERE[0], "lng": HERE[1]})
        assert body.status_code == 200
        reels = body.json()
        assert [r["id"] for r in reels] == ["rl_a_caption", "rl_b_kumo"]
        kumo = reels[1]
        assert kumo["mark"]["id"] == "kumo"
        assert kumo["distance_mi"] == pytest.approx(0.1, abs=0.1)
        assert kumo["saved"] is False
        assert reels[0]["mark"] is None and reels[0]["distance_mi"] is None

    def test_no_distance_without_location(self, client: TestClient) -> None:
        reels = client.get("/api/v1/reels").json()
        assert all(r["distance_mi"] is None for r in reels)

    def test_no_user_coordinates_anywhere(self, client: TestClient) -> None:
        reels = client.get("/api/v1/reels", params={"lat": HERE[0], "lng": HERE[1]})
        assert set(coordinate_paths(reels.json())) <= {".mark.lat", ".mark.lng"}
        assert str(HERE[0]) not in reels.text

    def test_requires_a_user(self, client: TestClient) -> None:
        assert client.get("/api/v1/reels", headers={"X-User-Id": ""}).status_code == 401


class TestPlace:
    def test_friend_live_move_gives_headline(
        self, client: TestClient, moves: SqlMoveGateway
    ) -> None:
        move_id = live_move(moves, "tony", ("anish", "priya"))
        asyncio.run(moves.add_participant(move_id, "priya", "going", "tap"))
        place = client.get("/api/v1/reels/rl_b_kumo/place").json()
        active = place["active_move"]
        assert active["id"] == move_id
        assert active["creator"]["id"] == "tony"
        assert {u["id"] for u in active["friends_there"]} == {"tony", "priya"}
        assert active["participants_count"] == 2
        assert active["my_status"] is None
        assert place["headline"] == "Tony + 1 friend are here rn"
        assert place["mark"]["id"] == "kumo"

    def test_creator_alone(self, client: TestClient, moves: SqlMoveGateway) -> None:
        live_move(moves, "tony", ("anish",))
        place = client.get("/api/v1/reels/rl_b_kumo/place").json()
        assert place["headline"] == "Tony is here rn"

    def test_no_move_offers_a_draft(self, client: TestClient, muse: FakeMuse) -> None:
        place = client.get(
            "/api/v1/reels/rl_b_kumo/place", params={"lat": HERE[0], "lng": HERE[1]}
        ).json()
        assert place["active_move"] is None
        assert place["headline"] == "Start a Move here"
        assert place["draft"]["text"] == "getting matcha"
        assert place["draft"]["mark"]["id"] == "kumo"
        assert place["draft"]["source"] == "heuristic"
        assert place["draft"]["notify"][0]["user"]["id"] == "priya"
        assert muse.composed == [
            {"mark_id": "kumo", "seed": "best matcha in town", "at": (37.485, -122.148)}
        ]
        assert set(coordinate_paths(place)) <= {
            ".mark.lat",
            ".mark.lng",
            ".draft.mark.lat",
            ".draft.mark.lng",
        }

    def test_hidden_move_never_shows(
        self, client: TestClient, moves: SqlMoveGateway
    ) -> None:
        live_move(moves, "maya", ("tony",))
        place = client.get("/api/v1/reels/rl_b_kumo/place").json()
        assert place["active_move"] is None
        assert place["headline"] == "Start a Move here"

    def test_muse_error_gives_null_draft(
        self, client: TestClient, moves: SqlMoveGateway, muse: FakeMuse
    ) -> None:
        live_move(moves, "tony", ("anish",))
        muse.fail = True
        place = client.get("/api/v1/reels/rl_b_kumo/place").json()
        assert place["draft"] is None
        assert place["headline"] == "Tony is here rn"

    def test_slow_muse_times_out(
        self, client: TestClient, muse: FakeMuse, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(reels_service, "PLACE_DRAFT_TIMEOUT_S", 0.05)
        muse.hang = True
        response = client.get("/api/v1/reels/rl_b_kumo/place")
        assert response.status_code == 200
        assert response.json()["draft"] is None
        assert response.json()["headline"] == "Start a Move here"

    def test_unmarked_reel_resolves_once_and_persists(
        self, client: TestClient, muse: FakeMuse, engine: Engine
    ) -> None:
        muse.resolution = PlaceResolution(mark_id="cafe", confidence=0.4)
        first = client.get("/api/v1/reels/rl_a_caption/place").json()
        assert first["mark"]["id"] == "cafe"
        assert first["confirm_place"] is True
        second = client.get("/api/v1/reels/rl_a_caption/place").json()
        assert second["mark"]["id"] == "cafe"
        assert second["confirm_place"] is False
        assert muse.resolved == ["this quiet cafe is a vibe"]
        with Session(engine) as s:
            assert s.get(Reel, "rl_a_caption").resolved_mark_id == "cafe"

    def test_unresolved_reel_still_answers(self, client: TestClient) -> None:
        place = client.get("/api/v1/reels/rl_a_caption/place").json()
        assert place["mark"] is None
        assert place["headline"] == "Start a Move here"

    def test_unknown_reel_is_404(self, client: TestClient) -> None:
        assert client.get("/api/v1/reels/nope/place").status_code == 404


class TestSave:
    def test_save_then_unsave(self, client: TestClient, engine: Engine) -> None:
        assert client.post("/api/v1/reels/rl_b_kumo/save").status_code == 204
        assert client.post("/api/v1/reels/rl_b_kumo/save").status_code == 204
        with Session(engine) as s:
            assert s.get(SavedReel, ("anish", "rl_b_kumo")) is not None
            mark = s.exec(select(SavedMark).where(SavedMark.user_id == "anish")).one()
            assert (mark.mark_id, mark.source, mark.source_ref) == (
                "kumo",
                "reel",
                "rl_b_kumo",
            )
        saved = {r["id"]: r["saved"] for r in client.get("/api/v1/reels").json()}
        assert saved == {"rl_a_caption": False, "rl_b_kumo": True}

        assert client.delete("/api/v1/reels/rl_b_kumo/save").status_code == 204
        with Session(engine) as s:
            assert s.get(SavedReel, ("anish", "rl_b_kumo")) is None
            assert s.exec(select(SavedMark)).all() == []

    def test_unsave_keeps_a_map_saved_mark(
        self, client: TestClient, engine: Engine, clock: FixedClock
    ) -> None:
        with Session(engine) as s:
            s.add(SavedMark(user_id="anish", mark_id="kumo", saved_at=T0))
            s.commit()
        client.delete("/api/v1/reels/rl_b_kumo/save")
        with Session(engine) as s:
            assert s.exec(select(SavedMark)).one().source == "map"

    def test_save_reel_without_mark(self, client: TestClient, engine: Engine) -> None:
        assert client.post("/api/v1/reels/rl_a_caption/save").status_code == 204
        with Session(engine) as s:
            assert s.exec(select(SavedMark)).all() == []

    def test_unknown_reel_is_404(self, client: TestClient) -> None:
        assert client.post("/api/v1/reels/nope/save").status_code == 404
        assert client.delete("/api/v1/reels/nope/save").status_code == 404
