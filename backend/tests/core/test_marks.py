"""C6: Marks (nearby, search, create, detail, save) and `MarkGateway`."""

from collections.abc import Iterator, Sequence
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.container import Container
from app.core import db
from app.core.gateways import SqlMarkGateway
from app.domain.errors import MarkNotFound
from app.hooks import Hooks
from app.lanes import core as core_lane
from app.main import create_app
from app.ports import MarkGateway, MoveStatus, ParticipantStatus
from app.repositories.marks import SqlMarkRepository
from app.scheduler.loop import Scheduler
from app.services.marks import (
    GHOST_WINDOW,
    InvalidMark,
    MarkInput,
    MarkService,
    bounding_box,
    distance_km,
)
from app.tables import (
    Block,
    Friendship,
    Mark,
    MarkRanking,
    Moment,
    Move,
    MoveAudience,
    MoveParticipant,
    Reel,
    SavedMark,
    SavedReel,
    User,
    UserSettings,
)

NOW = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
HOME = (32.9857, -96.7502)  # viewer's query point
CAST = ("anish", "tony", "maya", "priya", "stranger")


class FixedClock:
    def __init__(self, now: datetime = NOW) -> None:
        self.at = now

    def now(self) -> datetime:
        return self.at


# --- builders ----------------------------------------------------------------


def add_mark(
    session: Session,
    mark_id: str,
    *,
    km_north: float = 0.0,
    name: str | None = None,
    category: str = "coffee",
) -> None:
    lat = HOME[0] + km_north / 111.195
    session.add(
        Mark(
            id=mark_id,
            name=name or mark_id.title(),
            category=category,  # type: ignore[arg-type]
            lat=lat,
            lng=HOME[1],
        )
    )
    session.commit()


def add_move(
    session: Session,
    move_id: str,
    mark_id: str,
    *,
    creator: str = "tony",
    audience: Sequence[str] = ("anish",),
    status: MoveStatus = "live",
    ends_at: datetime | None = None,
    people: Sequence[tuple[str, ParticipantStatus, datetime | None]] = (),
    never_arrived: Sequence[str] = (),
) -> None:
    """People who are `there` or `left` arrived at the start unless listed in
    `never_arrived` (a Pull up that never made it)."""
    started = NOW - timedelta(hours=30)
    session.add(
        Move(
            id=move_id,
            creator_id=creator,
            mark_id=mark_id,
            text="who's down",
            category="coffee",
            status=status,
            starts_at=started,
            ends_at=ends_at,
            created_at=started,
        )
    )
    session.add_all(MoveAudience(move_id=move_id, user_id=uid) for uid in audience)
    for uid, p_status, left_at in people:
        session.add(
            MoveParticipant(
                move_id=move_id,
                user_id=uid,
                status=p_status,
                joined_via="creator" if uid == creator else "tap",
                joined_at=started,
                arrived_at=(
                    started
                    if p_status != "going" and uid not in never_arrived
                    else None
                ),
                left_at=left_at,
            )
        )
    session.commit()


def ago(hours: float) -> datetime:
    return NOW - timedelta(hours=hours)


@pytest.fixture
def world(session: Session) -> Session:
    for uid in CAST:
        session.add(
            User(
                id=uid, name=f"{uid.title()} X", first_name=uid.title(), created_at=NOW
            )
        )
    for friend in ("tony", "maya", "priya"):
        session.add(Friendship(user_a="anish", user_b=friend, since=NOW))
    session.commit()
    return session


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()


@pytest.fixture
def marks(world: Session, clock: FixedClock) -> MarkService:
    return MarkService(SqlMarkRepository(world), clock)


@pytest.fixture
def client(engine: Engine, world: Session) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        app.state.container.clock = FixedClock()
        client.headers["X-User-Id"] = "anish"
        yield client


def ghost_ids(marks: MarkService, viewer: str, mark_id: str) -> list[str]:
    return [g.user.id for g in marks.detail(viewer, mark_id).ghosts]


# --- geometry ----------------------------------------------------------------


def test_distance_and_bounding_box() -> None:
    assert distance_km(*HOME, *HOME) == 0
    assert distance_km(0, 0, 1, 0) == pytest.approx(111.195, rel=1e-3)
    box = bounding_box(*HOME, 2.0)
    for dlat, dlng in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        lat = HOME[0] + dlat * 0.0179  # ~1.99 km
        lng = HOME[1] + dlng * 0.0179 / 0.8386  # cos(lat)
        assert distance_km(*HOME, lat, lng) < 2.0
        assert box.min_lat <= lat <= box.max_lat
        assert box.min_lng <= lng <= box.max_lng


# --- nearby ------------------------------------------------------------------


def test_nearby_returns_saved_marks_nearest_first_within_radius(
    world: Session, marks: MarkService
) -> None:
    for mark_id, km in (("far", 3.0), ("near", 0.5), ("mid", -1.5), ("out", 6.0)):
        add_mark(world, mark_id, km_north=km)
        marks.save("anish", mark_id)
    add_mark(world, "unsaved", km_north=0.1)

    found = marks.nearby("anish", *HOME, radius_km=5, limit=50)
    assert [n.view.mark.id for n in found] == ["near", "mid", "far"]
    assert [round(n.distance_km, 1) for n in found] == [0.5, 1.5, 3.0]
    assert all(n.view.saved for n in found)

    limited = marks.nearby("anish", *HOME, radius_km=5, limit=2)
    assert [n.view.mark.id for n in limited] == ["near", "mid"]


def test_nearby_includes_marks_with_ghosts_only_for_the_audience(
    world: Session, marks: MarkService
) -> None:
    add_mark(world, "kumo", km_north=1)
    add_move(world, "m1", "kumo", people=[("tony", "left", ago(2))])

    [item] = marks.nearby("anish", *HOME, radius_km=5, limit=10)
    assert item.view.mark.id == "kumo"
    assert not item.view.saved
    assert [(g.user.id, g.move_id, g.at) for g in item.ghosts] == [
        ("tony", "m1", ago(2))
    ]
    assert marks.nearby("stranger", *HOME, radius_km=5, limit=10) == []


def test_nearby_http(client: TestClient, world: Session) -> None:
    add_mark(world, "kumo", km_north=1)
    add_mark(world, "fat", km_north=0.2)
    for mark_id in ("kumo", "fat"):
        assert client.post(f"/api/v1/marks/{mark_id}/save").status_code == 204

    res = client.get(
        "/api/v1/marks/nearby", params={"lat": HOME[0], "lng": HOME[1], "limit": 1}
    )
    assert res.status_code == 200
    [body] = res.json()
    assert body["id"] == "fat" and body["saved"] is True
    assert body["ghosts"] == [] and body["distance_km"] == pytest.approx(0.2, abs=1e-3)
    bad = client.get("/api/v1/marks/nearby", params={"lat": 91, "lng": 0})
    assert bad.status_code == 422


# --- ghosts ------------------------------------------------------------------


def test_ghost_window_boundary(world: Session, marks: MarkService) -> None:
    add_mark(world, "kumo")
    add_move(
        world,
        "m1",
        "kumo",
        audience=("anish", "maya", "priya"),
        people=[
            ("tony", "left", ago(23)),
            ("maya", "left", ago(25)),
            ("priya", "left", NOW - GHOST_WINDOW),
        ],
    )
    assert ghost_ids(marks, "anish", "kumo") == ["tony"]


def test_memory_starts_when_you_leave_while_the_ghost_lasts_a_day(world, marks, clock):
    add_mark(world, "kumo")
    add_move(world, "visit", "kumo", people=[("tony", "left", NOW)])
    clock.at = NOW - timedelta(microseconds=1)
    assert marks.memories("tony") == []  # not left yet
    clock.at = NOW
    [memory] = marks.memories("tony")
    assert (memory.move_id, memory.mark.id, memory.at) == ("visit", "kumo", NOW)
    assert ghost_ids(marks, "anish", "kumo") == ["tony"]  # friends still see the Ghost
    clock.at = NOW + GHOST_WINDOW
    assert ghost_ids(marks, "anish", "kumo") == []
    clock.at += timedelta(days=30)
    assert [m.move_id for m in marks.memories("tony")] == ["visit"]
    # The archive is personal, even when the viewer could see the original Ghost.
    assert marks.memories("anish") == []


def test_memory_lists_the_others_who_arrived(world, marks):
    add_mark(world, "kumo")
    add_move(
        world,
        "visit",
        "kumo",
        audience=("maya", "priya", "anish"),
        people=[
            ("tony", "left", ago(1)),
            ("maya", "left", ago(2)),
            ("priya", "there", None),
        ],
    )
    [memory] = marks.memories("tony")
    assert {u.id for u in memory.people} == {"maya", "priya"}


def test_memories_departure_precedes_end_and_never_arrived_excluded(world, marks):
    add_mark(world, "kumo")
    add_move(
        world,
        "left",
        "kumo",
        status="ended",
        ends_at=ago(1),
        people=[("anish", "left", ago(25))],
    )
    add_move(
        world,
        "ended",
        "kumo",
        status="ended",
        ends_at=ago(26),
        people=[("anish", "there", None)],
    )
    add_move(
        world,
        "never-arrived",
        "kumo",
        status="ended",
        ends_at=ago(30),
        people=[("anish", "left", ago(29))],
        never_arrived=["anish"],
    )
    add_move(world, "quiet", "kumo", status="ended", ends_at=ago(30))
    add_move(
        world,
        "cancelled",
        "kumo",
        status="cancelled",
        ends_at=ago(30),
        people=[("anish", "left", ago(29))],
    )
    assert [m.move_id for m in marks.memories("anish")] == ["left", "ended"]
    assert [m.move_id for m in marks.memories("anish", limit=1, offset=1)] == ["ended"]


def test_memories_http_is_private_and_respects_block(world, client):
    add_mark(world, "kumo")
    add_move(
        world,
        "visit",
        "kumo",
        status="ended",
        ends_at=ago(25),
        people=[("anish", "there", None)],
    )
    response = client.get("/api/v1/me/memories")
    assert response.status_code == 200
    [memory] = response.json()
    assert memory["move_id"] == "visit" and memory["mark_name"] == "Kumo"
    assert memory["people"] == []  # nobody else arrived
    assert not {"lat", "lng", "user"}.intersection(memory)
    assert (
        client.get("/api/v1/me/memories", headers={"X-User-Id": "stranger"}).json()
        == []
    )
    assert client.get("/api/v1/me/memories?offset=-1").status_code == 422
    world.add(Block(user_id="tony", hidden_from_user_id="anish", created_at=NOW))
    world.commit()
    assert client.get("/api/v1/me/memories").json() == []


def test_ended_move_leaves_ghosts_of_those_still_there(
    world: Session, marks: MarkService
) -> None:
    add_mark(world, "kumo")
    add_move(
        world,
        "ended",
        "kumo",
        status="ended",
        ends_at=ago(3),
        audience=("anish", "maya", "priya"),
        people=[
            ("tony", "there", None),
            ("maya", "left", ago(4)),
            ("priya", "going", None),
        ],
    )
    detail = marks.detail("anish", "kumo")
    assert [(g.user.id, g.at) for g in detail.ghosts] == [
        ("tony", ago(3)),
        ("maya", ago(4)),
    ]


def test_ghosts_need_an_arrival(world: Session, marks: MarkService) -> None:
    """A Pull up that never made it (no `arrived_at`) never ghosts, even if an
    old row says `left`; someone still `there` when the Move ended does."""
    add_mark(world, "kumo")
    add_move(
        world,
        "ended",
        "kumo",
        status="ended",
        ends_at=ago(1),
        audience=("anish", "maya", "priya"),
        people=[
            ("tony", "there", None),
            ("maya", "left", ago(2)),
            ("priya", "there", None),
        ],
        never_arrived=("maya", "priya"),
    )
    detail = marks.detail("anish", "kumo")
    assert [(g.user.id, g.text) for g in detail.ghosts] == [("tony", "who's down")]


def test_ghosts_respect_audience_settings_blocks_and_status(
    world: Session, marks: MarkService
) -> None:
    add_mark(world, "kumo")
    # Live Move: `there` is a full avatar, not a ghost; only `left` counts.
    add_move(
        world,
        "live",
        "kumo",
        audience=("anish", "maya", "priya"),
        people=[
            ("tony", "there", None),
            ("maya", "left", ago(1)),
            ("priya", "left", ago(1)),
        ],
    )
    add_move(
        world,
        "cancelled",
        "kumo",
        creator="maya",
        status="cancelled",
        people=[("maya", "left", ago(1))],
    )
    assert ghost_ids(marks, "anish", "kumo") == ["maya", "priya"]

    world.add(UserSettings(user_id="maya", ghost_visible=False))
    world.add(Block(user_id="priya", hidden_from_user_id="anish"))
    world.commit()
    assert ghost_ids(marks, "anish", "kumo") == []
    # The viewer never sees their own ghost; a non-audience viewer sees none.
    assert ghost_ids(marks, "priya", "kumo") == []
    assert ghost_ids(marks, "stranger", "kumo") == []


def test_creator_block_hides_the_whole_move(world: Session, marks: MarkService) -> None:
    add_mark(world, "kumo")
    add_move(world, "m1", "kumo", people=[("tony", "left", ago(1))])
    world.add(Block(user_id="tony", hidden_from_user_id="anish"))
    world.commit()
    detail = marks.detail("anish", "kumo")
    assert detail.ghosts == () and detail.moves_count == 0


# --- search ------------------------------------------------------------------


def test_search_matches_names_prefix_first(world: Session, marks: MarkService) -> None:
    add_mark(world, "a", name="The Matcha Bar")
    add_mark(world, "b", name="Matcha Cafe Maiko")
    add_mark(world, "c", name="Kumo Matcha")
    add_mark(world, "d", name="Fat Straws")
    add_mark(world, "e", name="100% Boba")
    marks.save("anish", "c")

    found = marks.search("anish", "  MATCHA ", limit=10)
    assert [v.mark.name for v in found] == [
        "Matcha Cafe Maiko",
        "Kumo Matcha",
        "The Matcha Bar",
    ]
    assert [v.saved for v in found] == [False, True, False]
    assert [v.mark.id for v in marks.search("anish", "%", limit=10)] == ["e"]
    assert len(marks.search("anish", "a", limit=2)) == 2
    with pytest.raises(InvalidMark):
        marks.search("anish", "   ", limit=10)


def test_search_http(client: TestClient, world: Session) -> None:
    add_mark(world, "kumo", name="Kumo Matcha")
    res = client.get("/api/v1/marks/search", params={"q": "kumo"})
    assert [m["id"] for m in res.json()] == ["kumo"]
    assert client.get("/api/v1/marks/search", params={"q": ""}).status_code == 422


# --- create ------------------------------------------------------------------


def test_create_normalizes_and_stores_a_user_mark(
    world: Session, marks: MarkService
) -> None:
    view = marks.create(
        "anish",
        MarkInput(
            name="  Kumo Matcha ",
            category="coffee",
            lat=32.99,
            lng=-96.75,
            address=" 1 Main St ",
            price_level=2,
            vibe_tags=(" Quiet", "quiet", "", "Aesthetic"),
        ),
    )
    assert view.mark.name == "Kumo Matcha"
    assert view.mark.vibe_tags == ("quiet", "aesthetic")
    assert view.mark.address == "1 Main St"
    row = world.get_one(Mark, view.mark.id)
    assert (row.source, row.created_by) == ("user", "anish")


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "   "},
        {"name": "x" * 81},
        {"category": "museum"},
        {"lat": 91.0},
        {"lng": -181.0},
        {"price_level": 5},
        {"vibe_tags": tuple(f"t{i}" for i in range(9))},
    ],
)
def test_create_rejects_invalid_marks(marks: MarkService, changes: dict) -> None:
    data = {"name": "Kumo", "category": "coffee", "lat": 0.0, "lng": 0.0} | changes
    with pytest.raises(InvalidMark):
        marks.create("anish", MarkInput(**data))


def test_create_http(client: TestClient) -> None:
    body = {"name": "Kumo", "category": "coffee", "lat": 1.0, "lng": 2.0}
    res = client.post("/api/v1/marks", json=body)
    assert res.status_code == 201
    assert res.json()["saved"] is False and res.json()["score"] is None
    blank = client.post("/api/v1/marks", json=body | {"name": " "})
    assert blank.status_code == 422 and "name" in blank.json()["detail"]
    bad = client.post("/api/v1/marks", json=body | {"category": "museum"})
    assert bad.status_code == 422


# --- detail ------------------------------------------------------------------


def test_detail_works_with_empty_rankings(world: Session, marks: MarkService) -> None:
    add_mark(world, "kumo")
    detail = marks.detail("anish", "kumo")
    assert (detail.view.score, detail.view.friends_score) == (None, None)
    assert detail.top_ranker is None
    assert (detail.ghosts, detail.moments, detail.moves_count) == ((), (), 0)


def test_detail_scores_from_rankings(world: Session, marks: MarkService) -> None:
    add_mark(world, "kumo")
    for uid, score in (("anish", 7.0), ("tony", 9.0), ("maya", 6.5), ("stranger", 10)):
        world.add(
            MarkRanking(
                user_id=uid, mark_id="kumo", category="coffee", position=1, score=score
            )
        )
    world.commit()
    detail = marks.detail("anish", "kumo")
    assert detail.view.score == 7.0
    assert detail.view.friends_score == 7.8  # strangers never count
    assert detail.top_ranker is not None
    assert (detail.top_ranker.user.id, detail.top_ranker.score) == ("tony", 9.0)


def test_detail_never_leaks_moves_the_viewer_cannot_see(
    world: Session, marks: MarkService
) -> None:
    add_mark(world, "kumo")
    add_move(world, "seen", "kumo", people=[("tony", "left", ago(1))])
    add_move(
        world,
        "hidden",
        "kumo",
        creator="priya",
        audience=("maya",),
        people=[("priya", "left", ago(1))],
    )
    for moment_id, move_id, status in (
        ("ok", "seen", "approved"),
        ("pending", "seen", "pending"),
        ("secret", "hidden", "approved"),
    ):
        world.add(
            Moment(
                id=moment_id,
                move_id=move_id,
                mark_id="kumo",
                author_id="tony" if move_id == "seen" else "priya",
                media_url=f"/media/{moment_id}.jpg",
                status=status,
                created_at=ago(1),
            )
        )
    world.commit()

    detail = marks.detail("anish", "kumo")
    assert detail.moves_count == 1
    assert [g.move_id for g in detail.ghosts] == ["seen"]
    assert [m.moment.id for m in detail.moments] == ["ok"]
    # Pending Moments show to people who were in the Move (7.4).
    assert {m.moment.id for m in marks.detail("tony", "kumo").moments} == {
        "ok",
        "pending",
    }
    stranger = marks.detail("stranger", "kumo")
    assert (stranger.moves_count, stranger.ghosts, stranger.moments) == (0, (), ())


def test_detail_http(client: TestClient, world: Session) -> None:
    add_mark(world, "kumo")
    add_move(world, "m1", "kumo", people=[("tony", "left", ago(2))])
    body = client.get("/api/v1/marks/kumo").json()
    assert body["id"] == "kumo" and body["moves_count"] == 1
    assert [g["user"]["id"] for g in body["ghosts"]] == ["tony"]
    assert not {"lat", "lng"} & set(body["ghosts"][0]["user"])
    missing = client.get("/api/v1/marks/nope")
    assert missing.status_code == 404 and "nope" in missing.json()["detail"]


# --- save / unsave -----------------------------------------------------------


def test_save_is_idempotent_and_keeps_the_first_save(
    world: Session, marks: MarkService, clock: FixedClock
) -> None:
    add_mark(world, "kumo")
    marks.save("anish", "kumo")
    clock.at = NOW + timedelta(hours=1)
    marks.save("anish", "kumo")
    row = world.get_one(SavedMark, ("anish", "kumo"))
    assert (row.source, row.source_ref, row.saved_at) == ("map", None, NOW)

    marks.save("anish", "kumo", "reel", "reel-1")
    marks.save("anish", "kumo", "map", None)  # never overwrites a Reel save
    world.refresh(row)
    assert (row.source, row.source_ref, row.saved_at) == ("reel", "reel-1", NOW)

    marks.unsave("anish", "kumo")
    marks.unsave("anish", "kumo")
    assert world.get(SavedMark, ("anish", "kumo")) is None
    with pytest.raises(MarkNotFound):
        marks.save("anish", "nope")


def test_mark_flared_stamps_saved_marks_only(
    world: Session, marks: MarkService
) -> None:
    add_mark(world, "kumo")
    add_mark(world, "fat")
    marks.save("anish", "kumo", "reel", "reel-1")
    marks.mark_flared("anish", "kumo")
    marks.mark_flared("anish", "fat")
    assert world.get_one(SavedMark, ("anish", "kumo")).flared_at == NOW
    assert world.get(SavedMark, ("anish", "fat")) is None


def test_save_unsave_and_saved_list_http(client: TestClient, world: Session) -> None:
    add_mark(world, "kumo")
    add_mark(world, "fat")
    world.add(
        Reel(
            id="r1",
            author_name="dallaseats",
            video_url="/media/r1.mp4",
            thumb_url="/media/r1.jpg",
            resolved_mark_id="fat",
        )
    )
    world.add(SavedReel(user_id="anish", reel_id="r1", saved_at=NOW))
    world.commit()

    for _ in range(2):
        assert client.post("/api/v1/marks/kumo/save").status_code == 204
    saved = client.get("/api/v1/me/saved").json()
    assert [(s["mark"]["id"], s["source"]) for s in saved["marks"]] == [("kumo", "map")]
    assert saved["marks"][0]["mark"]["saved"] is True
    assert [(r["id"], r["mark_id"]) for r in saved["reels"]] == [("r1", "fat")]

    for _ in range(2):
        assert client.delete("/api/v1/marks/kumo/save").status_code == 204
    assert client.get("/api/v1/me/saved").json()["marks"] == []
    assert client.post("/api/v1/marks/nope/save").status_code == 404
    assert client.delete("/api/v1/marks/nope/save").status_code == 404


# --- gateway -----------------------------------------------------------------


def test_gateway_methods(engine: Engine, world: Session) -> None:
    add_mark(world, "far", km_north=4)
    add_mark(world, "near", km_north=-0.3)
    add_mark(world, "mid", km_north=1)
    gateway = SqlMarkGateway(engine, FixedClock())
    assert isinstance(gateway, MarkGateway)

    near = gateway.get("near")
    assert near is not None and near.category == "coffee"
    assert gateway.get("nope") is None
    assert [m.id for m in gateway.nearest(*HOME, limit=2)] == ["near", "mid"]
    assert gateway.nearest(*HOME, limit=0) == []

    gateway.save("anish", "mid", "reel", "reel-9")
    gateway.save("anish", "mid", "reel", "reel-9")
    gateway.mark_flared("anish", "mid")
    world.expire_all()
    row = world.get_one(SavedMark, ("anish", "mid"))
    assert (row.source, row.source_ref, row.flared_at) == ("reel", "reel-9", NOW)
    gateway.unsave("anish", "mid")
    gateway.unsave("anish", "mid")
    world.expire_all()
    assert world.get(SavedMark, ("anish", "mid")) is None
    with pytest.raises(MarkNotFound):
        gateway.save("anish", "nope", "map", None)


def test_core_lane_registers_mark_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "engine", db.make_engine(db.MEMORY))
    container = Container()
    core_lane.register(container, Hooks(), Scheduler())
    assert isinstance(container.marks, SqlMarkGateway)
