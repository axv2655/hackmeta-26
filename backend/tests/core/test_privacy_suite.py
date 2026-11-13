"""C11: the privacy and safety suite (ARCHITECTURE.md 1.5, 12, 17.3).

End to end over HTTP (and the WebSocket where events matter), on a fresh
in-memory database built with `tests.core.factories`. Every response the
suite receives is audited for coordinates (`audit_payload`), so each test
also checks rule 1.5.2 on whatever it happens to fetch.

The world (`Scene`):

* ana (verified) posts Move `m` at Kumo to her Circle "crew": bo, cy, eve
  and mom. ana blocks mom, so mom is never in the audience.
* bo and cy pull up and arrive. cy adds an untagged Moment (approved at
  once); bo adds a Moment tagging cy (pending). Then bo leaves: a ghost.
* eve is in the audience but never joined. dee is ana's friend outside the
  audience. zed is a verified stranger, uno an unverified one.

So `m` is visible to ana, bo, cy, eve and hidden from dee (non-audience
friend), mom (blocked), zed and uno. The pending Moment is visible to the
Move's participants (ana, bo, cy) only.
"""

import asyncio
import json
import re
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select
from starlette.websockets import WebSocketDisconnect

from app.api.routes.moments import get_media_dir
from app.core import db
from app.core.config import settings
from app.core.gateways import SqlMoveGateway
from app.domain.errors import MoveNotFound, MoveNotOpen
from app.hooks import Hooks
from app.main import create_app
from app.ports import EventType
from app.realtime import ConnectionHub
from app.tables import metadata
from tests.core.factories import (
    T0,
    add_block,
    add_circle,
    add_friends,
    add_mark,
    add_user,
    add_users,
)
from tests.core.fakes import FixedClock

API = settings.API_V1_STR
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 60
KUMO = (30.2849, -97.7341)
FAR = (31.2849, -97.7341)  # about 110 km north

VISIBLE = ("ana", "bo", "cy", "eve")
HIDDEN = ("dee", "mom", "zed", "uno")
"""`dee`: friend outside the audience. `mom`: in the Circle but blocked.
`zed`: verified stranger. `uno`: unverified stranger."""
PARTICIPANTS = ("ana", "bo", "cy")


# --- Coordinate audit (12.1) -------------------------------------------------

MARK_KEYS = frozenset({"id", "name", "category", "address", "vibe_tags"})
"""A dict carrying all of these is a Mark; only Marks may carry lat/lng."""
NEVER_KEYS = frozenset(
    {
        "latitude",
        "longitude",
        "lon",
        "coords",
        "coordinates",
        "gps",
        "location",
        "last_area",
        "last_lat",
        "last_lng",
    }
)
"""Keys that would mean a person's location; no response may carry them."""


def audit_payload(payload: Any, path: str) -> None:
    """Fail if a JSON payload carries coordinates outside a Mark, or a
    person's area outside the caller's own `/me`."""
    if isinstance(payload, list):
        for item in payload:
            audit_payload(item, path)
        return
    if not isinstance(payload, dict):
        return
    keys = set(payload)
    assert not keys & NEVER_KEYS, f"{path}: location keys {keys & NEVER_KEYS}"
    if keys & {"lat", "lng"}:
        assert MARK_KEYS <= keys, f"{path}: lat/lng outside a Mark: {payload}"
    if "first_name" in keys:  # a person
        assert not keys & {"lat", "lng"}, f"{path}: a person with coordinates"
        if "home_area" in keys:
            assert path == f"{API}/me", f"{path}: another user's home_area"
    for value in payload.values():
        audit_payload(value, path)


def audit_response(response: httpx.Response) -> None:
    if not response.headers.get("content-type", "").startswith("application/json"):
        return
    response.read()
    if response.content:
        audit_payload(response.json(), response.request.url.path)


# --- Fakes -------------------------------------------------------------------


class RecordingHub(ConnectionHub):
    """The real hub, also keeping every publish as `(user_ids, type, data)`."""

    def __init__(self, clock: FixedClock) -> None:
        super().__init__(clock)
        self.published: list[tuple[frozenset[str], EventType, dict[str, Any]]] = []

    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        targets = frozenset(user_ids)
        self.published.append((targets, type, data))
        await super().publish(targets, type, data)

    def received_by(self, user_id: str) -> list[tuple[EventType, dict[str, Any]]]:
        return [(t, d) for users, t, d in self.published if user_id in users]


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, dict[str, str]]] = []

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        self.sent.append((user_id, type, data))
        return f"n{len(self.sent)}"


# --- The world ---------------------------------------------------------------


def as_(user_id: str) -> dict[str, str]:
    return {"X-User-Id": user_id}


class Scene:
    def __init__(
        self, client: TestClient, engine: Engine, clock: FixedClock, hub: RecordingHub
    ) -> None:
        self.client = client
        self.engine = engine
        self.clock = clock
        self.hub = hub
        self.gateway = SqlMoveGateway(engine, clock, hub, Hooks())
        self.move_id = ""
        self.ok_moment: dict[str, Any] = {}
        self.pending_moment: dict[str, Any] = {}

    # HTTP shorthands; every response passes `audit_response`.

    def get(self, user: str, path: str, **params: Any) -> httpx.Response:
        return self.client.get(f"{API}{path}", headers=as_(user), params=params)

    def post(self, user: str, path: str, body: Any = None) -> httpx.Response:
        return self.client.post(f"{API}{path}", headers=as_(user), json=body)

    def ok(self, response: httpx.Response, code: int = 200) -> Any:
        assert response.status_code == code, response.text
        return response.json() if response.content else None

    def post_move(self, user: str = "ana", **fields: Any) -> dict[str, Any]:
        body = {
            "mark_id": "kumo",
            "text": "matcha?",
            "category": "coffee",
            "circle_ids": ["crew"],
        }
        return self.ok(self.post(user, "/moves", body | fields), 201)

    def upload(
        self, user: str, move_id: str, tags: tuple[str, ...] = ()
    ) -> httpx.Response:
        return self.client.post(
            f"{API}/moves/{move_id}/moments",
            headers=as_(user),
            files={"file": ("photo.jpg", JPEG, "image/jpeg")},
            data={"caption": "here", "tagged_user_ids": list(tags)},
        )

    def feed_ids(self, user: str) -> list[str]:
        return [m["id"] for m in self.ok(self.get(user, "/moves/feed"))]

    def nearby_ids(self, user: str) -> list[str]:
        lat, lng = KUMO
        moves = self.ok(self.get(user, "/moves/nearby", lat=lat, lng=lng))
        return [m["id"] for m in moves]

    def mark_detail(self, user: str, mark_id: str = "kumo") -> dict[str, Any]:
        return self.ok(self.get(user, f"/marks/{mark_id}"))

    def ghost_ids(self, user: str) -> list[str]:
        return [g["user"]["id"] for g in self.mark_detail(user)["ghosts"]]

    def nearby_mark_ghosts(self, user: str) -> list[str]:
        lat, lng = KUMO
        marks = self.ok(self.get(user, "/marks/nearby", lat=lat, lng=lng))
        return [g["user"]["id"] for m in marks for g in m["ghosts"]]

    def moment_ids(self, user: str, move_id: str | None = None) -> list[str]:
        moments = self.ok(self.get(user, f"/moves/{move_id or self.move_id}/moments"))
        return [m["id"] for m in moments]

    def media_status(self, user: str, moment: dict[str, Any]) -> int:
        return self.client.get(moment["media_url"], headers=as_(user)).status_code

    def block(self, user: str, other: str) -> None:
        self.ok(self.post(user, "/me/blocks", {"user_id": other}), 201)

    def run[T](self, fn: Any, *args: Any) -> Any:
        """Run a coroutine function on the app's loop (where the hub lives)."""
        return self.client.portal.call(fn, *args)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def world(session: Session) -> Session:
    add_users(
        session,
        ("ana", "bo", "cy", "eve", "dee", "zed", "uno"),
        verified=("ana", "zed"),
    )
    add_user(session, "mom", verified=True, home_area="Hyde Park")
    add_friends(session, "ana", "bo", "cy", "eve", "mom", "dee")
    add_circle(session, "crew", "ana", "bo", "cy", "eve", "mom")
    add_circle(session, "bos-pals", "bo", "dee", "zed")
    add_block(session, "ana", "mom")
    add_mark(session, "kumo", *KUMO)
    add_mark(session, "far", *FAR, category="food")
    session.commit()
    return session


@pytest.fixture
def hub(clock: FixedClock) -> RecordingHub:
    return RecordingHub(clock)


@pytest.fixture
def notifier() -> RecordingNotifier:
    return RecordingNotifier()


@pytest.fixture
def client(
    engine: Engine,
    world: Session,
    clock: FixedClock,
    hub: RecordingHub,
    notifier: RecordingNotifier,
    tmp_path: Path,
) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    app.dependency_overrides[get_media_dir] = lambda: tmp_path / "uploads"
    with TestClient(app) as client:
        container = app.state.container
        container.clock, container.events, container.notifier = clock, hub, notifier
        client.event_hooks = {"request": [], "response": [audit_response]}
        yield client


@pytest.fixture
def scene(
    client: TestClient, engine: Engine, clock: FixedClock, hub: RecordingHub
) -> Scene:
    s = Scene(client, engine, clock, hub)
    s.move_id = s.post_move()["id"]
    for user in ("bo", "cy"):
        s.ok(s.post(user, f"/moves/{s.move_id}/join"))
        s.ok(s.post(user, f"/moves/{s.move_id}/arrive"))
    clock.advance(minutes=10)
    s.ok_moment = s.ok(s.upload("cy", s.move_id), 201)
    s.pending_moment = s.ok(s.upload("bo", s.move_id, ("cy",)), 201)
    assert (s.ok_moment["status"], s.pending_moment["status"]) == (
        "approved",
        "pending",
    )
    clock.advance(minutes=20)
    s.ok(s.post("bo", f"/moves/{s.move_id}/leave"))
    clock.advance(minutes=5)
    return s


# --- 17.3: hidden Moves are 404 on every endpoint ----------------------------


def _hidden_requests(s: Scene, move_id: str) -> dict[str, httpx.Request]:
    """Every endpoint that names a Move or its Moments, for `move_id`. Moment
    endpoints use the scene's Moments when `move_id` is the scene's Move and
    unknown Moments otherwise."""
    real = move_id == s.move_id
    ok = s.ok_moment if real else {"id": "nope1"}
    pending = s.pending_moment if real else {"id": "nope2"}
    media = ok["media_url"] if real else f"{API}/media/nope1.jpg"
    c = s.client
    reqs = {
        "detail": c.build_request("GET", f"{API}/moves/{move_id}"),
        "moments": c.build_request("GET", f"{API}/moves/{move_id}/moments"),
        "upload": c.build_request(
            "POST",
            f"{API}/moves/{move_id}/moments",
            files={"file": ("p.jpg", JPEG, "image/jpeg")},
        ),
        "approve-approved": c.build_request(
            "POST", f"{API}/moments/{ok['id']}/approve", json={"approve": True}
        ),
        "approve-pending": c.build_request(
            "POST", f"{API}/moments/{pending['id']}/approve", json={"approve": True}
        ),
        "media": c.build_request("GET", media),
    }
    for action in ("join", "arrive", "leave", "end"):
        reqs[action] = c.build_request("POST", f"{API}/moves/{move_id}/{action}")
    return reqs


ENDPOINTS = (
    "detail",
    "join",
    "arrive",
    "leave",
    "end",
    "moments",
    "upload",
    "approve-approved",
    "approve-pending",
    "media",
)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("viewer", HIDDEN)
def test_hidden_move_is_404_and_indistinguishable_from_missing(
    scene: Scene, viewer: str, endpoint: str
) -> None:
    hidden = _hidden_requests(scene, scene.move_id)[endpoint]
    missing = _hidden_requests(scene, "no-such-move")[endpoint]
    for request in (hidden, missing):
        request.headers["X-User-Id"] = viewer
    got, baseline = scene.client.send(hidden), scene.client.send(missing)

    assert got.status_code == baseline.status_code == 404, got.text
    # Same message shape as a Move or Moment that does not exist.
    real_ids = (
        scene.move_id,
        scene.ok_moment["id"],
        scene.pending_moment["id"],
        scene.ok_moment["media_url"].rsplit("/", 1)[1].split(".")[0],
    )
    detail = got.json()["detail"]
    for real_id in real_ids:
        detail = detail.replace(real_id, "ID")
    assert re.sub(r"no-such-move|nope\d", "ID", baseline.json()["detail"]) == detail


def test_visible_viewers_reach_the_same_endpoints(scene: Scene) -> None:
    """Positive control for the matrix above: nothing is 404 because of a
    broken request."""
    for viewer in VISIBLE:
        move = scene.ok(scene.get(viewer, f"/moves/{scene.move_id}"))
        # Only the creator is shown who can see the Move (1.5.4).
        assert (move["audience"] is not None) == (viewer == "ana")
        assert scene.ok_moment["id"] in scene.moment_ids(viewer)
        assert scene.media_status(viewer, scene.ok_moment) == 200


@pytest.mark.parametrize("viewer", HIDDEN)
def test_hidden_move_never_appears_in_lists(scene: Scene, viewer: str) -> None:
    """Feed, map, Mark pins, Mark detail (ghosts, Moments, counts) and the
    saved list: not one of them mentions the Move or its Moments."""
    scene.ok(scene.post(viewer, "/marks/kumo/save"), 204)  # so Kumo is pinned
    lat, lng = KUMO
    responses = [
        scene.get(viewer, "/moves/feed"),
        scene.get(viewer, "/moves/nearby", lat=lat, lng=lng),
        scene.get(viewer, "/marks/nearby", lat=lat, lng=lng),
        scene.get(viewer, "/marks/kumo"),
        scene.get(viewer, "/marks/search", q="kumo"),
        scene.get(viewer, "/me/saved"),
    ]
    secrets = (scene.move_id, scene.ok_moment["id"], scene.pending_moment["id"])
    for response in responses:
        assert response.status_code == 200, response.text
        assert not any(s in response.text for s in secrets), response.request.url

    assert scene.feed_ids(viewer) == []
    assert scene.nearby_ids(viewer) == []
    assert scene.nearby_mark_ghosts(viewer) == []
    detail = scene.mark_detail(viewer)
    assert (detail["ghosts"], detail["moments"], detail["moves_count"]) == ([], [], 0)


def test_audience_sees_move_ghost_and_approved_moments(scene: Scene) -> None:
    """Positive control for the list checks, from eve (audience only)."""
    assert scene.feed_ids("eve") == [scene.move_id]
    assert scene.nearby_ids("eve") == [scene.move_id]
    assert scene.ghost_ids("eve") == ["bo"]
    assert scene.nearby_mark_ghosts("eve") == ["bo"]
    detail = scene.mark_detail("eve")
    assert [m["id"] for m in detail["moments"]] == [scene.ok_moment["id"]]
    assert detail["moves_count"] == 1


def test_far_viewer_location_only_filters_the_map(scene: Scene) -> None:
    lat, lng = FAR
    assert scene.ok(scene.get("eve", "/moves/nearby", lat=lat, lng=lng)) == []


# --- Blocks ------------------------------------------------------------------


def test_block_after_posting_hides_everything_from_a_participant(
    scene: Scene,
) -> None:
    """cy is `there` with a Moment of her own when ana blocks her: the block
    applies at once to the Move, its Moments, media, ghosts and events."""
    scene.block("ana", "cy")
    before = len(scene.hub.received_by("cy"))

    assert scene.get("cy", f"/moves/{scene.move_id}").status_code == 404
    assert scene.feed_ids("cy") == []
    assert scene.nearby_ids("cy") == []
    assert scene.get("cy", f"/moves/{scene.move_id}/moments").status_code == 404
    assert scene.media_status("cy", scene.ok_moment) == 404
    assert scene.media_status("cy", scene.pending_moment) == 404
    assert scene.ghost_ids("cy") == []
    assert scene.mark_detail("cy")["moments"] == []
    approve = f"/moments/{scene.pending_moment['id']}/approve"
    assert scene.post("cy", approve, {"approve": True}).status_code == 404

    scene.ok(scene.upload("ana", scene.move_id), 201)
    scene.ok(scene.post("ana", f"/moves/{scene.move_id}/end"))
    assert len(scene.hub.received_by("cy")) == before

    # The block is a live filter: lifting it restores access.
    scene.ok(scene.client.delete(f"{API}/me/blocks/cy", headers=as_("ana")), 204)
    assert scene.get("cy", f"/moves/{scene.move_id}").status_code == 200


def test_block_after_posting_leaves_the_audience_line_and_gateway(
    scene: Scene,
) -> None:
    """The creator's AudienceLine and `MoveGateway.audience_ids` (what the
    notify pipeline reads) only list people who can still see the Move."""
    audience = scene.ok(scene.get("ana", f"/moves/{scene.move_id}"))["audience"]
    assert [p["id"] for p in audience["people"]] == ["bo", "cy", "eve"]
    assert scene.gateway.audience_ids(scene.move_id) == {"bo", "cy", "eve"}

    scene.block("ana", "eve")
    audience = scene.ok(scene.get("ana", f"/moves/{scene.move_id}"))["audience"]
    assert audience["count"] == 2
    assert [p["id"] for p in audience["people"]] == ["bo", "cy"]
    assert scene.gateway.audience_ids(scene.move_id) == {"bo", "cy"}


def test_blocked_user_is_never_in_an_audience(scene: Scene) -> None:
    preview = scene.ok(
        scene.post(
            "ana",
            "/audience/preview",
            {"circle_ids": ["crew", "bos-pals"], "user_ids": ["mom", "dee"]},
        )
    )
    # mom is blocked; bo's Circle is not ana's to use.
    assert [p["id"] for p in preview["people"]] == ["bo", "cy", "dee", "eve"]
    assert preview["circles"] == [{"id": "crew", "name": "Crew"}]

    move = scene.post_move(user_ids=["mom", "dee"], circle_ids=["crew", "bos-pals"])
    assert move["audience"]["people"] == preview["people"]
    assert move["audience"]["count"] == preview["count"] == 4
    assert scene.get("mom", f"/moves/{move['id']}").status_code == 404
    assert scene.get("zed", f"/moves/{move['id']}").status_code == 404
    assert scene.get("dee", f"/moves/{move['id']}").status_code == 200


def test_block_is_one_way(scene: Scene) -> None:
    """eve hides her Moves from ana (12.1): ana cannot see eve's Moves, but
    eve still sees ana's."""
    scene.block("eve", "ana")
    eves = scene.post_move("eve", circle_ids=[], user_ids=["ana", "bo"])
    assert eves["audience"]["count"] == 1
    assert scene.get("ana", f"/moves/{eves['id']}").status_code == 404
    assert scene.get("bo", f"/moves/{eves['id']}").status_code == 200
    assert scene.get("eve", f"/moves/{scene.move_id}").status_code == 200
    assert scene.move_id in scene.feed_ids("eve")


def test_notify_list_stays_inside_the_audience(scene: Scene) -> None:
    """A creator's edited notify list can never reach someone who cannot see
    the Move (blocked, outside the audience, or the creator)."""
    move = scene.post_move(notify_user_ids=["bo", "dee", "mom", "ana", "eve", "x"])
    stored = scene.gateway.get(move["id"])
    assert stored is not None
    assert stored.notify_user_ids == ("bo", "eve")
    plain = scene.gateway.get(scene.post_move()["id"])
    assert plain is not None and plain.notify_user_ids is None


# --- Ghosts (7.4, 12.5) ------------------------------------------------------


def test_ghosts_follow_the_ghost_users_settings_and_blocks(scene: Scene) -> None:
    assert scene.ghost_ids("eve") == ["bo"]

    scene.block("bo", "eve")  # bo hides himself from eve
    assert scene.ghost_ids("eve") == []
    assert scene.ghost_ids("cy") == ["bo"]

    scene.ok(
        scene.client.patch(
            f"{API}/me/settings", headers=as_("bo"), json={"ghost_visible": False}
        )
    )
    assert scene.ghost_ids("cy") == []


def test_ghosts_expire_after_24_hours(scene: Scene) -> None:
    scene.clock.advance(hours=23)
    assert scene.ghost_ids("eve") == ["bo"]
    scene.clock.advance(hours=1, minutes=1)
    assert scene.ghost_ids("eve") == []
    assert scene.nearby_mark_ghosts("eve") == []


# --- Moments (1.5.7) ---------------------------------------------------------


def test_pending_moment_is_limited_to_participants(scene: Scene) -> None:
    pending = scene.pending_moment
    for user in PARTICIPANTS:
        assert pending["id"] in scene.moment_ids(user)
        assert scene.media_status(user, pending) == 200
    assert scene.moment_ids("eve") == [scene.ok_moment["id"]]
    assert scene.media_status("eve", pending) == 404
    assert scene.mark_detail("eve")["moments"][0]["id"] == scene.ok_moment["id"]
    assert len(scene.mark_detail("eve")["moments"]) == 1
    counts = {
        u: scene.ok(scene.get(u, f"/moves/{scene.move_id}"))["moments_count"]
        for u in VISIBLE
    }
    assert counts == {"ana": 2, "bo": 2, "cy": 2, "eve": 1}
    approve = f"/moments/{pending['id']}/approve"
    assert scene.post("eve", approve, {"approve": True}).status_code == 404
    assert scene.post("bo", approve, {"approve": True}).status_code == 403


def test_approval_widens_and_withdrawal_narrows(scene: Scene) -> None:
    pending = scene.pending_moment
    approve = f"/moments/{pending['id']}/approve"
    scene.ok(scene.post("cy", approve, {"approve": True}))
    assert pending["id"] in scene.moment_ids("eve")
    assert scene.media_status("eve", pending) == 200
    for viewer in HIDDEN:
        assert scene.media_status(viewer, pending) == 404

    scene.ok(scene.post("cy", approve, {"approve": False}))
    assert pending["id"] not in scene.moment_ids("eve")
    assert scene.media_status("eve", pending) == 404


def test_only_participants_add_and_are_tagged_in_moments(scene: Scene) -> None:
    assert scene.upload("eve", scene.move_id).status_code == 403
    for outsider in ("eve", "dee", "mom"):
        assert scene.upload("cy", scene.move_id, (outsider,)).status_code == 422
    assert scene.client.get(scene.ok_moment["media_url"]).status_code == 401


@pytest.mark.parametrize("name", ["../app.db", "..%2Fapp.db", "x.txt", "nope.jpg"])
def test_media_paths_never_escape(scene: Scene, name: str) -> None:
    response = scene.client.get(f"{API}/media/{name}", headers=as_("ana"))
    assert response.status_code == 404


# --- Realtime (9.1, 12.1) ----------------------------------------------------


def test_events_only_reach_people_who_can_see(scene: Scene) -> None:
    approve = f"/moments/{scene.pending_moment['id']}/approve"
    scene.ok(scene.post("cy", approve, {"approve": True}))
    scene.ok(scene.post("ana", f"/moves/{scene.move_id}/end"))

    assert scene.hub.published, "the scene publishes events"
    for users, type, data in scene.hub.published:
        assert not users & set(HIDDEN), (type, users)
        audit_payload(data, f"event {type}")
        if type == "moment.added" and data["status"] == "pending":
            assert users <= set(PARTICIPANTS), users
        if type == "moment.approval_needed":
            assert users == {"cy"}
    kinds = {t for t, _ in scene.hub.received_by("eve")}
    assert {"move.created", "participant.changed", "moment.added", "move.ended"} <= (
        kinds
    )


def _wait_for_sockets(scene: Scene, user_id: str, count: int) -> None:
    async def settled() -> None:
        for _ in range(1000):
            if scene.hub.socket_count(user_id) == count:
                return
            await asyncio.sleep(0)
        raise AssertionError(f"{user_id} has {scene.hub.socket_count(user_id)}")

    scene.run(settled)


def test_websocket_delivers_to_audience_and_nothing_to_hidden(scene: Scene) -> None:
    with (
        scene.client.websocket_connect(f"{API}/ws?user_id=eve") as eve,
        scene.client.websocket_connect(f"{API}/ws?user_id=mom") as mom,
        scene.client.websocket_connect(f"{API}/ws?user_id=dee") as dee,
    ):
        for user in ("eve", "mom", "dee"):
            _wait_for_sockets(scene, user, 1)
        scene.ok(scene.upload("cy", scene.move_id), 201)
        scene.ok(scene.upload("cy", scene.move_id, ("ana",)), 201)  # pending
        scene.ok(scene.post("ana", f"/moves/{scene.move_id}/end"))
        sentinel: EventType = "notification"
        scene.run(scene.hub.publish, ["eve", "mom", "dee"], sentinel, {"id": "end"})

        got = []
        while (message := eve.receive_json())["type"] != sentinel:
            got.append(message)
            audit_payload(message, "ws")
        assert [(m["type"], m["data"].get("status")) for m in got] == [
            ("moment.added", "approved"),
            ("move.ended", "ended"),
        ]
        for hidden in (mom, dee):
            assert hidden.receive_json()["data"] == {"id": "end"}


@pytest.mark.parametrize("query", ["", "?user_id=", "?user_id=ghost"])
def test_websocket_needs_a_known_user(client: TestClient, query: str) -> None:
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(f"{API}/ws{query}"):
            pass
    assert closed.value.code == 1008


# --- Open Moves and verification (8.5, 12.3) ---------------------------------


def test_unverified_users_cannot_post_open_moves(scene: Scene) -> None:
    body = {"mark_id": "kumo", "text": "pickup?", "category": "fitness"}
    body |= {"user_ids": ["ana"], "open": True}
    response = scene.post("uno", "/moves", body)
    assert response.status_code == 403
    assert "verified" in response.json()["detail"]
    assert scene.feed_ids("ana") == [scene.move_id]
    creators = [
        d["creator_id"] for _, d in scene.hub.received_by("ana") if "creator_id" in d
    ]
    assert "uno" not in creators

    closed = scene.ok(scene.post("uno", "/moves", body | {"open": False}), 201)
    assert closed["open"] is False


def test_open_move_is_not_public(scene: Scene) -> None:
    """`open` only widens discovery over BLE: until a stranger joins that way
    the Move is as hidden from them as any other."""
    move = scene.post_move(open=True)
    assert move["open"] is True
    for stranger in ("zed", "uno"):
        assert scene.get(stranger, f"/moves/{move['id']}").status_code == 404
        assert scene.post(stranger, f"/moves/{move['id']}/join").status_code == 404
        assert move["id"] not in scene.feed_ids(stranger)
        assert move["id"] not in scene.nearby_ids(stranger)


def test_open_ble_join_rules(scene: Scene) -> None:
    open_id = scene.post_move(open=True)["id"]

    # Verified, not blocked: joins at the venue and now sees the Move.
    scene.run(scene.gateway.add_participant, open_id, "zed", "there", "open_ble")
    detail = scene.ok(scene.get("zed", f"/moves/{open_id}"))
    assert detail["my_status"] == "there"
    assert detail["audience"] is None  # only the creator sees the AudienceLine
    [joined] = [p for p in detail["participants"] if p["user"]["id"] == "zed"]
    assert joined["joined_via"] == "open_ble"
    assert "zed" in scene.gateway.audience_ids(open_id)
    assert open_id in scene.feed_ids("zed")
    assert scene.move_id not in scene.feed_ids("zed")  # nothing else widens

    # Unverified, or blocked by the creator: as if the Move did not exist.
    for barred in ("uno", "mom"):
        with pytest.raises(MoveNotFound):
            scene.run(
                scene.gateway.add_participant, open_id, barred, "there", "open_ble"
            )
        assert scene.get(barred, f"/moves/{open_id}").status_code == 404
        assert barred not in scene.gateway.audience_ids(open_id)

    # A closed Move cannot be joined over BLE, seen or not.
    with pytest.raises(MoveNotFound):
        scene.run(
            scene.gateway.add_participant, scene.move_id, "zed", "there", "open_ble"
        )
    with pytest.raises(MoveNotOpen):
        scene.run(
            scene.gateway.add_participant, scene.move_id, "eve", "there", "open_ble"
        )

    for users, _, _ in scene.hub.published:
        assert not users & {"uno", "mom"}


# --- No user coordinates anywhere (12.1, 17.3) -------------------------------


def _response_schemas(app: FastAPI) -> dict[str, dict[str, Any]]:
    """Every OpenAPI component reachable from a response, by name."""
    spec = app.openapi()
    components = spec.get("components", {}).get("schemas", {})
    seen: dict[str, dict[str, Any]] = {}

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str):
                name = ref.rsplit("/", 1)[1]
                if name not in seen:
                    seen[name] = components[name]
                    walk(components[name])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for path in spec["paths"].values():
        for operation in path.values():
            walk(operation.get("responses", {}))
    return seen


def test_no_response_schema_carries_user_coordinates() -> None:
    """Introspects every lane's response models through the OpenAPI schema."""
    schemas = _response_schemas(create_app(lanes=()))
    assert "MoveRead" in schemas and "UserLite" in schemas
    for name, schema in schemas.items():
        fields = set(schema.get("properties", {}))
        assert not fields & NEVER_KEYS, (name, fields & NEVER_KEYS)
        if fields & {"lat", "lng"}:
            assert MARK_KEYS <= fields, f"{name} has lat/lng but is not a Mark"
            assert "first_name" not in fields and "user_id" not in fields, name
    user = schemas["UserLite"]["properties"]
    assert set(user) == {
        "id",
        "name",
        "first_name",
        "avatar_url",
        "avatar_color",
        "fb_verified",
    }


def test_only_marks_store_coordinates() -> None:
    coordinate = re.compile(r"(^|_)(lat|lng|latitude|longitude|lon|gps)($|_)")
    columns = [
        f"{table.name}.{column.name}"
        for table in metadata.sorted_tables
        for column in table.columns
        if coordinate.search(column.name)
    ]
    assert sorted(columns) == ["marks.lat", "marks.lng"]


def _dump(engine: Engine) -> dict[str, list[tuple[Any, ...]]]:
    with Session(engine) as session:
        return {
            table.name: sorted(
                # `execute`, not `exec`: `exec` yields bare ids for a Table, so
                # a changed column (like `last_area`) would go unnoticed.
                (tuple(map(repr, row)) for row in session.execute(select(table))),
            )
            for table in metadata.sorted_tables
        }


def test_location_queries_are_coarse_and_never_stored(
    scene: Scene, engine: Engine
) -> None:
    before = _dump(engine)
    lat, lng = 30.2849371, -97.7341288
    responses = [
        scene.get("eve", "/moves/nearby", lat=lat, lng=lng),
        scene.get("eve", "/marks/nearby", lat=lat, lng=lng),
    ]
    for response in responses:
        assert response.status_code == 200
        assert "2849371" not in response.text and "7341288" not in response.text
    assert _dump(engine) == before


def test_opted_in_nearby_changes_only_the_area_label(
    scene: Scene, engine: Engine
) -> None:
    opted = scene.client.patch(
        f"{API}/me/settings", headers=as_("eve"), json={"location_opt_in": True}
    )
    scene.ok(opted)
    before = _dump(engine)
    lat, lng = 37.4850123, -122.1482456  # inside the demo region
    for path in ("/moves/nearby", "/marks/nearby"):
        assert scene.get("eve", path, lat=lat, lng=lng).status_code == 200
    after = _dump(engine)

    assert [t for t in after if after[t] != before[t]] == ["users"]
    assert "Menlo Park" in repr(after["users"]) and "Menlo Park" not in repr(
        before["users"]
    )
    assert "4850123" not in repr(after) and "1482456" not in repr(after)


def test_other_users_area_is_never_shown(scene: Scene) -> None:
    """mom's `home_area` shows on her own `/me` only."""
    me = scene.ok(scene.get("mom", "/me"))
    assert me["user"]["home_area"] == "Hyde Park"
    for path in ("/friends", "/me/blocks", "/auth/users"):
        assert "Hyde Park" not in scene.get("ana", path).text


def test_audit_catches_leaks() -> None:
    """The response audit itself: a person with coordinates, lat/lng outside
    a Mark, and location keys all fail."""
    leaks = [
        {"user": {"id": "a", "first_name": "A", "lat": 1.0, "lng": 2.0}},
        [{"id": "m", "lat": 1.0, "lng": 2.0}],
        {"data": {"location": "x"}},
        {"people": [{"first_name": "A", "home_area": "Hyde Park"}]},
    ]
    for leak in leaks:
        with pytest.raises(AssertionError):
            audit_payload(leak, f"{API}/moves/feed")
    audit_payload(
        {"mark": {"id": "k", "name": "K", "category": "coffee", "address": "",
                  "vibe_tags": [], "lat": 1.0, "lng": 2.0}},
        f"{API}/moves/feed",
    )  # fmt: skip


# --- Auth everywhere (14) ----------------------------------------------------

PUBLIC = (
    ("GET", f"{API}/health"),
    ("GET", f"{API}/auth/users"),  # the login picker, before anyone is signed in
    ("POST", f"{API}/auth/signup"),  # making an account, signed out
    ("POST", f"{API}/auth/login"),
    # Demo Mark photos: manifest-listed, shared by category, carry no user data.
    ("GET", "/media/seed/marks/{asset_name}"),
    # Global Muse runtime counters (client, model, token budget): no user data.
    ("GET", f"{API}/muse/status"),
)
PUBLIC_PREFIXES = (
    f"{API}/notes",  # scaffolding sample, not part of the product
    f"{API}/demo",  # Demo Control, DEMO_MODE only (15.2)
)


def _operations() -> dict[tuple[str, str], dict[str, Any]]:
    """Every HTTP operation of every lane, from the OpenAPI schema, so a new
    route is covered the moment it is mounted."""
    spec = create_app(lanes=()).openapi()
    return {
        (method.upper(), path): operation
        for path, item in spec["paths"].items()
        for method, operation in item.items()
    }


OPERATIONS = _operations()
PRIVATE_ROUTES = sorted(
    key
    for key in OPERATIONS
    if key not in PUBLIC and not key[1].startswith(PUBLIC_PREFIXES)
)


def test_route_inventory_covers_core() -> None:
    paths = {path for _, path in PRIVATE_ROUTES}
    for expected in ("/moves/{move_id}", "/media/{filename}", "/me", "/circles"):
        assert f"{API}{expected}" in paths
    assert "/media/{filename}" in paths  # canonical root route, same policy
    assert ("GET", f"{API}/auth/users") in OPERATIONS


@pytest.mark.parametrize(("method", "path"), PRIVATE_ROUTES)
def test_every_route_requires_a_current_user(
    client: TestClient, method: str, path: str
) -> None:
    params = OPERATIONS[(method, path)].get("parameters", [])
    assert {"name": "X-User-Id", "in": "header"} in [
        {"name": p["name"], "in": p["in"]} for p in params
    ], f"{method} {path} does not take the current user"

    url = re.sub(r"\{(\w+)\}", lambda m: f"x-{m.group(1)}.jpg", path)
    for headers in ({}, as_(""), as_("ghost")):
        response = client.request(method, url, headers=headers)
        assert response.status_code == 401, (headers, response.text)
        assert json.loads(response.text)["detail"]
