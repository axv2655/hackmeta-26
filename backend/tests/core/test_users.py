"""C7: users, auth picker, settings, friends, blocks, auto-join, Circles."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.container import Container
from app.core import db
from app.core.areas import coarse_area
from app.core.gateways import SqlUserGateway
from app.domain.errors import Invalid
from app.hooks import Hooks
from app.lanes import core as core_lane
from app.main import create_app
from app.repositories.unit_of_work import SqlCoreUnitOfWork
from app.scheduler.loop import Scheduler
from app.services.circles import CircleNotFound, CircleService, NotCircleOwner
from app.services.users import (
    UserNotFound,
    UserService,
    close_friend_ids,
)
from app.tables import (
    AutojoinPref,
    Circle,
    CircleMember,
    Friendship,
    Hangout,
    User,
    UserSettings,
)

NOW = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
CAST = ("anish", "tony", "maya", "priya", "mom")


class FixedClock:
    def now(self) -> datetime:
        return NOW


def add_users(session: Session, *ids: str) -> None:
    for uid in ids:
        session.add(
            User(
                id=uid,
                name=f"{uid.title()} Lastname",
                first_name=uid.title(),
                fb_verified=True,
                created_at=NOW,
            )
        )
    session.commit()


def befriend(session: Session, a: str, b: str) -> None:
    low, high = sorted((a, b))
    session.add(Friendship(user_a=low, user_b=high, since=NOW - timedelta(days=400)))
    session.commit()


def hang_out(session: Session, a: str, b: str, *, days_ago: int, n: int = 1) -> None:
    low, high = sorted((a, b))
    for i in range(n):
        session.add(
            Hangout(
                user_a=low,
                user_b=high,
                move_id=f"m-{low}-{high}-{days_ago}-{i}",
                mark_id="kumo",
                category="coffee",
                weekday=2,
                hour_bucket="afternoon",
                at=NOW - timedelta(days=days_ago),
            )
        )
    session.commit()


@pytest.fixture
def world(session: Session) -> Session:
    add_users(session, *CAST)
    for friend in ("tony", "maya", "priya", "mom"):
        befriend(session, "anish", friend)
    return session


@pytest.fixture
def users(world: Session) -> UserService:
    return UserService(SqlCoreUnitOfWork(world), FixedClock())


@pytest.fixture
def circles(world: Session) -> CircleService:
    return CircleService(SqlCoreUnitOfWork(world))


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


def ids(people: list[dict] | list[User]) -> list[str]:
    return [p["id"] if isinstance(p, dict) else p.id for p in people]


# --- auth picker and current user --------------------------------------------


def test_login_picker_lists_users_then_header_identifies_the_user(
    client: TestClient,
) -> None:
    client.headers.pop("X-User-Id")
    picked = client.get("/api/v1/auth/users").json()
    assert ids(picked) == ["anish", "maya", "mom", "priya", "tony"]
    assert set(picked[0]) == {
        "id",
        "name",
        "first_name",
        "avatar_url",
        "avatar_color",
        "fb_verified",
    }

    me = client.get("/api/v1/me", headers={"X-User-Id": picked[3]["id"]})
    assert me.status_code == 200
    assert me.json()["user"]["first_name"] == "Priya"


@pytest.mark.parametrize("headers", [{}, {"X-User-Id": ""}, {"X-User-Id": "ghost"}])
def test_current_user_rejects_missing_or_unknown_ids(
    client: TestClient, headers: dict[str, str]
) -> None:
    client.headers.pop("X-User-Id")
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 401
    assert "detail" in response.json()


def test_no_user_schema_carries_coordinates(client: TestClient) -> None:
    body = client.get("/api/v1/me").json()
    assert not {"lat", "lng", "last_area"} & set(body["user"])


# --- settings ------------------------------------------------------------------


def test_settings_default_to_opt_out_with_muse_on(users: UserService) -> None:
    settings = users.settings("anish")
    assert not settings.location_opt_in
    assert not settings.ble_opt_in
    assert not settings.calendar_opt_in
    assert not settings.open_moves_opt_in
    assert settings.muse_proactive
    assert settings.ghost_visible
    assert settings.quiet_hours is None


def test_settings_patch_changes_only_sent_fields(
    client: TestClient, world: Session
) -> None:
    circle = Circle(owner_id="anish", name="Roommates")
    world.add(circle)
    world.commit()

    response = client.patch(
        "/api/v1/me/settings",
        json={
            "location_opt_in": True,
            "default_circle_ids": [circle.id],
            "move_categories": ["coffee"],
            "quiet_hours": {"start": 23, "end": 8},
        },
    )
    assert response.status_code == 200
    body = client.get("/api/v1/me").json()["settings"]
    assert body["location_opt_in"] is True
    assert body["ble_opt_in"] is False
    assert body["muse_proactive"] is True
    assert body["default_circle_ids"] == [circle.id]
    assert body["quiet_hours"] == {"start": 23, "end": 8}

    cleared = client.patch("/api/v1/me/settings", json={"quiet_hours": None})
    assert cleared.json()["quiet_hours"] is None
    assert cleared.json()["location_opt_in"] is True


@pytest.mark.parametrize(
    "body",
    [
        {"ble_opt_in": None},
        {"default_circle_ids": ["not-mine"]},
        {"move_categories": ["skydiving"]},
        {"quiet_hours": {"start": 25, "end": 8}},
        {"user_id": "tony"},
    ],
)
def test_settings_patch_rejects_bad_input(client: TestClient, body: dict) -> None:
    assert client.patch("/api/v1/me/settings", json=body).status_code == 422


def test_default_circles_must_be_owned(users: UserService, world: Session) -> None:
    theirs = Circle(owner_id="tony", name="Tony's")
    world.add(theirs)
    world.commit()
    with pytest.raises(Invalid):
        users.update_settings("anish", {"default_circle_ids": [theirs.id]})


# --- friends -------------------------------------------------------------------


def test_close_friend_is_top_fifth_by_recent_hangouts() -> None:
    assert close_friend_ids({}) == set()
    assert close_friend_ids({"a": 0, "b": 0}) == set()
    counts = {"a": 9, "b": 4, "c": 4, "d": 1, "e": 0, "f": 0}
    assert close_friend_ids(counts) == {"a", "b", "c"}  # ceil(6/5)=2, tie on 4


def test_friends_list_tiers_by_hangouts_in_window(
    client: TestClient, world: Session
) -> None:
    add_users(world, "stranger")
    hang_out(world, "anish", "priya", days_ago=3, n=4)
    hang_out(world, "anish", "tony", days_ago=10)
    hang_out(world, "anish", "maya", days_ago=200, n=9)  # outside the window
    hang_out(world, "tony", "maya", days_ago=1, n=5)  # not anish's hangouts

    friends = client.get("/api/v1/friends").json()
    assert [(f["user"]["id"], f["tier"]) for f in friends] == [
        ("priya", "close"),
        ("maya", "friend"),
        ("mom", "friend"),
        ("tony", "friend"),
    ]
    assert friends[0]["since"].startswith("2025-")


def test_friendship_is_undirected(users: UserService) -> None:
    assert [f.user.id for f in users.friends("mom")] == ["anish"]


# --- blocks ----------------------------------------------------------------------


def test_block_add_list_remove_round_trip(client: TestClient, world: Session) -> None:
    added = client.post("/api/v1/me/blocks", json={"user_id": "mom"})
    assert added.status_code == 201
    assert ids(added.json()) == ["mom"]
    # idempotent, and blocking ends the friendship
    assert ids(client.post("/api/v1/me/blocks", json={"user_id": "mom"}).json()) == [
        "mom"
    ]
    assert "mom" not in ids([f["user"] for f in client.get("/api/v1/friends").json()])
    # directional: mom has not hidden anything from anish
    assert client.get("/api/v1/me/blocks", headers={"X-User-Id": "mom"}).json() == []

    assert client.delete("/api/v1/me/blocks/mom").status_code == 204
    assert client.get("/api/v1/me/blocks").json() == []
    assert client.delete("/api/v1/me/blocks/mom").status_code == 204


@pytest.mark.parametrize(
    ("user_id", "code"), [("anish", 422), ("ghost", 404)], ids=["self", "unknown"]
)
def test_block_rejects_self_and_unknown(
    client: TestClient, user_id: str, code: int
) -> None:
    response = client.post("/api/v1/me/blocks", json={"user_id": user_id})
    assert response.status_code == code


# --- auto-join -------------------------------------------------------------------


def test_autojoin_put_replaces_the_list(client: TestClient) -> None:
    assert client.get("/api/v1/me/autojoin").json() == []
    first = client.put("/api/v1/me/autojoin", json={"user_ids": ["tony", "priya"]})
    assert ids(first.json()) == ["priya", "tony"]
    second = client.put("/api/v1/me/autojoin", json={"user_ids": ["maya", "maya"]})
    assert ids(second.json()) == ["maya"]
    assert ids(client.get("/api/v1/me/autojoin").json()) == ["maya"]
    assert client.put("/api/v1/me/autojoin", json={"user_ids": []}).json() == []


def test_autojoin_and_circles_take_friends_only(client: TestClient) -> None:
    tony = {"X-User-Id": "tony"}
    put = client.put("/api/v1/me/autojoin", json={"user_ids": ["maya"]}, headers=tony)
    assert put.status_code == 422
    body = {"name": "Crew", "member_ids": ["maya"]}
    assert client.post("/api/v1/circles", json=body, headers=tony).status_code == 422
    made = client.post("/api/v1/circles", json={"name": "Crew"}, headers=tony)
    path = f"/api/v1/circles/{made.json()['id']}"
    patched = client.patch(path, json={"member_ids": ["maya"]}, headers=tony)
    assert patched.status_code == 422


def test_autojoin_is_directional(users: UserService) -> None:
    users.set_autojoin("anish", ["tony"])
    assert users.autojoin("tony") == []


@pytest.mark.parametrize(
    ("user_ids", "code"), [(["anish"], 422), (["tony", "ghost"], 404)]
)
def test_autojoin_rejects_self_and_unknown_and_keeps_old_list(
    client: TestClient, user_ids: list[str], code: int
) -> None:
    client.put("/api/v1/me/autojoin", json={"user_ids": ["maya"]})
    response = client.put("/api/v1/me/autojoin", json={"user_ids": user_ids})
    assert response.status_code == code
    assert ids(client.get("/api/v1/me/autojoin").json()) == ["maya"]


def test_user_gateway_adds_autojoin_idempotently(
    engine: Engine, world: Session
) -> None:
    gateway = SqlUserGateway(engine, FixedClock())
    gateway.add_autojoin("tony", "anish")
    gateway.add_autojoin("tony", "anish")
    rows = world.exec(select(AutojoinPref)).all()
    assert [(r.user_id, r.other_user_id) for r in rows] == [("tony", "anish")]
    with pytest.raises(UserNotFound):
        gateway.add_autojoin("tony", "ghost")
    with pytest.raises(Invalid):
        gateway.add_autojoin("tony", "tony")


def test_core_lane_registers_user_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "engine", db.make_engine(db.MEMORY))
    container = Container()
    core_lane.register(container, Hooks(), Scheduler())
    assert isinstance(container.users, SqlUserGateway)


# --- circles ---------------------------------------------------------------------


def test_circle_crud_round_trip(client: TestClient) -> None:
    created = client.post(
        "/api/v1/circles",
        json={
            "name": "  Climbing ",
            "emoji": "🧗",
            "fb_group_name": "UTD Climbing",
            "member_ids": ["tony", "maya"],
        },
    )
    assert created.status_code == 201
    circle = created.json()
    assert circle["name"] == "Climbing"
    assert circle["fb_group_name"] == "UTD Climbing"
    assert ids(circle["members"]) == ["maya", "tony"]

    path = f"/api/v1/circles/{circle['id']}"
    renamed = client.patch(path, json={"name": "Bouldering", "fb_group_name": None})
    assert renamed.json()["name"] == "Bouldering"
    assert renamed.json()["fb_group_name"] is None
    assert ids(renamed.json()["members"]) == ["maya", "tony"]  # untouched

    regrouped = client.patch(path, json={"member_ids": ["priya"]})
    assert ids(regrouped.json()["members"]) == ["priya"]
    assert regrouped.json()["name"] == "Bouldering"

    assert [c["id"] for c in client.get("/api/v1/circles").json()] == [circle["id"]]
    assert client.delete(path).status_code == 204
    assert client.get("/api/v1/circles").json() == []
    assert client.delete(path).status_code == 404


def test_circles_are_listed_only_to_their_owner(client: TestClient) -> None:
    client.post("/api/v1/circles", json={"name": "Roommates", "member_ids": ["tony"]})
    assert client.get("/api/v1/circles", headers={"X-User-Id": "tony"}).json() == []


def test_only_the_owner_edits_a_circle(
    client: TestClient, circles: CircleService
) -> None:
    view = circles.create("anish", "Roommates", ["tony"])
    path = f"/api/v1/circles/{view.circle.id}"
    as_tony = {"X-User-Id": "tony"}

    edit = client.patch(path, json={"member_ids": ["tony", "maya"]}, headers=as_tony)
    assert edit.status_code == 403
    assert client.delete(path, headers=as_tony).status_code == 403
    assert [m.id for m in circles.list_owned("anish")[0].members] == ["tony"]

    with pytest.raises(NotCircleOwner):
        circles.update("tony", view.circle.id, {"name": "Mine now"})
    with pytest.raises(CircleNotFound):
        circles.delete("anish", "nope")


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"name": "   "}, 422),
        ({"name": "x" * 61}, 422),
        ({"name": "Ok", "member_ids": ["anish"]}, 422),
        ({"name": "Ok", "member_ids": ["ghost"]}, 404),
    ],
)
def test_circle_create_validates(client: TestClient, body: dict, code: int) -> None:
    assert client.post("/api/v1/circles", json=body).status_code == code


@pytest.mark.parametrize("body", [{"name": None}, {"member_ids": None}, {"x": 1}])
def test_circle_patch_rejects_nulls_and_unknown_fields(
    client: TestClient, circles: CircleService, body: dict
) -> None:
    view = circles.create("anish", "Roommates")
    response = client.patch(f"/api/v1/circles/{view.circle.id}", json=body)
    assert response.status_code == 422


def test_deleting_a_circle_drops_members_and_default(
    circles: CircleService, users: UserService, world: Session
) -> None:
    keep = circles.create("anish", "Keep").circle.id
    gone = circles.create("anish", "Gone", ["tony"]).circle.id
    users.update_settings("anish", {"default_circle_ids": [keep, gone]})

    circles.delete("anish", gone)

    assert world.exec(select(CircleMember)).all() == []
    world.expire_all()
    assert world.get(UserSettings, "anish").default_circle_ids == [keep]


def test_circle_replace_failure_preserves_members(circles, monkeypatch):
    circle = circles.create("anish", "Crew", ["tony"]).circle
    original = circles.repo.replace_members

    def fail(cid, ids):
        original(cid, ids)
        raise RuntimeError("write interrupted")

    monkeypatch.setattr(circles.repo, "replace_members", fail)
    with pytest.raises(RuntimeError):
        circles.update("anish", circle.id, {"member_ids": ["maya"]})
    assert [u.id for u in circles.repo.members(circle.id)] == ["tony"]


def test_autojoin_replace_failure_preserves_preferences(users, monkeypatch):
    users.set_autojoin("anish", ["tony"])
    original = users.repo.replace_autojoin

    def fail(uid, others):
        original(uid, others)
        raise RuntimeError("write interrupted")

    monkeypatch.setattr(users.repo, "replace_autojoin", fail)
    with pytest.raises(RuntimeError):
        users.set_autojoin("anish", ["maya"])
    assert [u.id for u in users.autojoin("anish")] == ["tony"]


# --- coarse area label (12.1) ---------------------------------------------------

CAMPUS = (37.4850123, -122.1482456)  # Hacker Square: inside the demo region
ELSEWHERE = (30.2849371, -97.7341288)  # Austin: not a supported area


def last_area(world: Session, user: str = "anish") -> str | None:
    world.expire_all()
    return world.get_one(User, user).last_area


def opt_in(users: UserService, value: bool = True) -> None:
    users.update_settings("anish", {"location_opt_in": value})


def test_coarse_area_labels_only_the_supported_region() -> None:
    assert coarse_area(*CAMPUS) == "Menlo Park"
    assert coarse_area(*ELSEWHERE) is None
    assert coarse_area(0.0, 0.0) is None
    # rounding happens first: 37.4094 -> 37.409 is outside, 37.4096 -> 37.410 in
    assert coarse_area(37.4094, -122.2) is None
    assert coarse_area(37.4096, -122.2) == "Menlo Park"
    assert coarse_area(37.4101, -122.2) == "Menlo Park"


def test_near_area_requires_consent(users: UserService, world: Session) -> None:
    users.record_near_area("anish", *CAMPUS)
    assert last_area(world) is None

    opt_in(users)
    users.record_near_area("anish", *CAMPUS)
    assert last_area(world) == "Menlo Park"


def test_near_area_stores_only_label(
    users: UserService, world: Session, engine: Engine
) -> None:
    opt_in(users)
    users.record_near_area("anish", *CAMPUS)

    with Session(engine) as fresh:
        stored = repr([tuple(r) for r in fresh.exec(select(User))])
        stored += repr([tuple(r) for r in fresh.exec(select(UserSettings))])
    assert "Menlo Park" in stored
    assert "37.485" not in stored and "122.148" not in stored


def test_unknown_region_does_not_store_false_area(
    users: UserService, world: Session
) -> None:
    opt_in(users)
    users.record_near_area("anish", *ELSEWHERE)
    assert last_area(world) is None
    users.record_near_area("anish", *CAMPUS)
    users.record_near_area("anish", *ELSEWHERE)  # a stale label is not kept
    assert last_area(world) is None


def test_opt_out_clears_last_area(users: UserService, world: Session) -> None:
    opt_in(users)
    users.record_near_area("anish", *CAMPUS)
    assert last_area(world) == "Menlo Park"

    opt_in(users, False)
    assert last_area(world) is None
    users.record_near_area("anish", *CAMPUS)  # no consent, no record
    assert last_area(world) is None


@pytest.mark.parametrize("path", ["/api/v1/moves/nearby", "/api/v1/marks/nearby"])
def test_nearby_endpoints_record_label_with_consent(
    client: TestClient, world: Session, path: str
) -> None:
    params = {"lat": CAMPUS[0], "lng": CAMPUS[1]}
    assert client.get(path, params=params).status_code == 200
    assert last_area(world) is None  # opted out: nothing recorded

    client.patch("/api/v1/me/settings", json={"location_opt_in": True})
    assert client.get(path, params=params).status_code == 200
    assert last_area(world) == "Menlo Park"
    body = client.get("/api/v1/me").json()
    assert not {"lat", "lng", "last_area"} & set(body["user"])


def test_search_works_without_location(client: TestClient) -> None:
    assert client.get("/api/v1/marks/search", params={"q": "kumo"}).status_code in (
        200,
        404,
    )


def test_access_log_redacts_nearby_coordinates() -> None:
    from app.core.logging import strip_nearby_query

    assert strip_nearby_query("/api/v1/moves/nearby?lat=1.234567&lng=2.3456") == (
        "/api/v1/moves/nearby?<redacted>"
    )
    assert strip_nearby_query("/api/v1/marks/nearby?lat=1&lng=2") == (
        "/api/v1/marks/nearby?<redacted>"
    )
    assert strip_nearby_query("/api/v1/marks/search?q=kumo") == (
        "/api/v1/marks/search?q=kumo"
    )
