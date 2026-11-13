"""M4: notify pipeline, Notifier, hooks, notifications and preview routes."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.muse.client import FakeMuseClient
from app.services.notify import in_quiet_hours
from app.tables import Notification, UserSettings
from tests.muse import factories as f
from tests.muse.factories import T0, days, move_snap
from tests.muse.fakes import (
    FakeMoveGateway,
    FakeProximity,
    FixedClock,
    RecordingPublisher,
)

pytestmark = pytest.mark.anyio

AUDIENCE = {"anish", "maya", "priya", "dev", "sam", "riley"}


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def world(session: Session) -> Session:
    f.users(session, "tony", "anish", "maya", "priya", "sam", "riley", "zed")
    f.user(session, "dev", quiet_hours={"start": 13, "end": 16})  # 2 pm is quiet
    f.mark_row(session, "kumo", name="Kumo")
    for i, (who, age) in enumerate([("maya", 2), ("maya", 9), ("riley", 4)]):
        f.hangout(session, "tony", who, move_id=f"h{i}", at=T0 - days(age))
    session.commit()
    return session


@pytest.fixture
def ports(clock):
    moves = FakeMoveGateway(clock)
    moves.put(move_snap("mv1", "tony", there=["anish"]), AUDIENCE)
    return {
        "moves": moves,
        "events": RecordingPublisher(),
        "proximity": FakeProximity({"tony": {"priya"}}),
    }


def nudged(session: Session, type_: str = "move_nudge") -> dict[str, Notification]:
    session.expire_all()
    rows = session.exec(select(Notification).where(Notification.type == type_)).all()
    return {n.user_id: n for n in rows}


async def test_participants_cluster_and_quiet_hours_never_notified(
    engine, world, clock, ports
) -> None:
    _, hooks, _, _ = f.wire(engine, clock, **ports)
    await hooks.on_move_created.fire("mv1")
    got = nudged(world)
    # anish is a participant, priya is co-present with tony, dev is in quiet hours
    assert set(got) == {"maya", "riley", "sam"}
    assert got["maya"].body.startswith("Tony posted ")
    assert got["maya"].data["move_id"] == "mv1"
    assert got["maya"].data["route"] == "/move/mv1"
    published = ports["events"].of_type("notification")
    assert {next(iter(users)) for users, _ in published} == set(got)
    assert all(data["type"] == "move_nudge" for _, data in published)


async def test_cap_limits_picks(engine, session, clock) -> None:
    people = [f"p{i}" for i in range(10)]
    f.users(session, "tony", *people)
    f.mark_row(session, "kumo")
    session.commit()
    moves = FakeMoveGateway(clock)
    moves.put(move_snap("mv1", "tony"), set(people))
    _, hooks, _, _ = f.wire(engine, clock, moves=moves)
    await hooks.on_move_created.fire("mv1")
    assert len(nudged(session)) == 5  # min(8, ceil(10/2))


async def test_duplicates_are_skipped(engine, world, clock, ports) -> None:
    container, _, _, _ = f.wire(engine, clock, **ports)
    first = await container.muse.notify_move("mv1")
    again = await container.muse.notify_move("mv1")
    assert first and again == []
    assert len(nudged(world)) == len(first)


async def test_confirmed_notify_list_forces_in_and_out(
    engine, world, clock, ports
) -> None:
    ports["moves"].put(
        move_snap("mv2", "tony", notify_user_ids=("dev", "sam", "outsider")), AUDIENCE
    )
    world.get(UserSettings, "dev").quiet_hours = None
    world.commit()
    _, hooks, _, _ = f.wire(engine, clock, **ports)
    await hooks.on_move_created.fire("mv2")
    got = nudged(world)
    assert set(got) == {"dev", "sam"}  # outsider is not in the audience
    assert got["sam"].body.startswith("Tony posted ")


async def test_works_with_null_proximity_and_fake_muse(engine, world, clock) -> None:
    moves = FakeMoveGateway(clock)
    moves.put(move_snap("mv1", "tony"), {"maya", "priya"})
    client = FakeMuseClient(default="garbage")
    _, hooks, _, _ = f.wire(engine, clock, client, moves=moves)
    await hooks.on_move_created.fire("mv1")
    assert set(nudged(world)) == {"maya"}  # cap ceil(2/2) = 1, best affinity


async def test_poking_never_waits_on_muse(engine, world, clock, ports) -> None:
    def answer(system, prompt):
        rows = prompt.split("Candidates:\n")[1].splitlines()[1:]
        first = rows[0].split("|")[0]
        copy = f"Hey {{{first}}}, {{u1}}'s at Kumo rn"
        return {"picks": [{"user": first, "copy": copy, "reason": "regular"}]}

    client = FakeMuseClient({"notify_picker": answer})
    _, hooks, _, _ = f.wire(engine, clock, client, **ports)
    await hooks.on_move_created.fire("mv1")
    assert [c for c in client.calls if "notify" in str(c)] == []
    bodies = {n.body for n in nudged(world).values()}
    assert len(bodies) == 1 and next(iter(bodies)).startswith("Tony posted ")


async def test_join_tells_creator_and_nudges_joiners_close_friends(
    engine, world, clock, ports
) -> None:
    # maya joins; riley hangs out with maya and is in the audience; zed is not
    f.hangout(world, "maya", "riley", move_id="hx", at=T0 - days(3))
    f.hangout(world, "maya", "zed", move_id="hy", at=T0 - days(3))
    world.commit()
    _, hooks, _, _ = f.wire(engine, clock, **ports)
    await hooks.on_move_joined.fire("mv1", "maya")
    creator_note = nudged(world, "joined_your_move")["tony"]
    assert creator_note.body == "Maya is on the way."
    second = nudged(world, "friend_pulling_up")
    assert set(second) == {"riley"}  # never widens the audience to zed
    assert "Maya's pulling up to Tony's Move" in second["riley"].body


def test_quiet_hours_wrap_midnight() -> None:
    s = UserSettings(user_id="x", quiet_hours={"start": 23, "end": 8})

    def at(local_hour: int):
        return T0.replace(hour=(local_hour + 6) % 24)

    assert in_quiet_hours(s, at(23)) and in_quiet_hours(s, at(3))
    assert not in_quiet_hours(s, at(14))
    assert not in_quiet_hours(UserSettings(user_id="y"), at(3))


# --- routes -------------------------------------------------------------------


def test_notification_routes(engine, world, clock) -> None:
    world.add_all(
        Notification(
            id=f"n{i}",
            user_id="maya",
            type="move_nudge",
            title="t",
            body=f"b{i}",
            data={},
            created_at=T0 + days(i),
        )
        for i in range(3)
    )
    world.commit()
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as client:
        h = {"X-User-Id": "maya"}
        assert client.get("/api/v1/notifications").status_code == 401
        got = client.get("/api/v1/notifications", headers=h).json()
        assert [n["id"] for n in got] == ["n2", "n1", "n0"]
        r = client.post("/api/v1/notifications/read", headers=h, json={"ids": ["n1"]})
        assert r.json() == {"updated": 1}
        unread = client.get("/api/v1/notifications?unread_only=true", headers=h)
        assert [n["id"] for n in unread.json()] == ["n2", "n0"]
        r = client.post("/api/v1/notifications/read", headers=h)
        assert r.json() == {"updated": 2}


def test_notify_preview_route_sends_nothing(engine, world, clock) -> None:
    f.circle(world, "crew", "tony", ["maya", "riley", "dev"])
    world.commit()
    events = RecordingPublisher()
    app, _ = f.make_app(engine, clock, events=events)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/muse/notify-preview",
            headers={"X-User-Id": "tony"},
            json={
                "mark_id": "kumo",
                "text": "getting matcha",
                "circle_ids": ["crew"],
                "user_ids": ["sam"],
            },
        )
    assert r.status_code == 200
    picks = r.json()
    # audience maya, riley, dev, sam (cap 2); dev is in quiet hours
    assert [p["user"]["id"] for p in picks] == ["maya", "riley"]
    assert "posted" in picks[0]["copy"] and "Hey" not in picks[0]["copy"]
    assert "lat" not in picks[0]["user"]
    assert world.exec(select(Notification)).all() == []
    assert events.published == []


def test_post_then_notify_route_sends_only_the_confirmed_list(
    engine, world, clock, ports
) -> None:
    ports["moves"].put(move_snap("mv3", "tony", notify_user_ids=()), AUDIENCE)
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as client:
        h = {"X-User-Id": "tony"}
        r = client.post(
            "/api/v1/moves/mv3/notify", headers=h, json={"user_ids": ["sam", "zed"]}
        )
        assert r.status_code == 200
        assert [p["user"]["id"] for p in r.json()] == ["sam"]  # zed: not in audience
        again = client.post(
            "/api/v1/moves/mv3/notify", headers=h, json={"user_ids": ["sam"]}
        )
        assert again.json() == []  # already nudged
        other = {"X-User-Id": "maya"}
        body = {"user_ids": ["sam"]}
        assert (
            client.post(
                "/api/v1/moves/mv3/notify", headers=other, json=body
            ).status_code
            == 403
        )
        assert (
            client.post("/api/v1/moves/nope/notify", headers=h, json=body).status_code
            == 404
        )
    assert set(nudged(world)) == {"sam"}


async def test_empty_notify_list_at_creation_nudges_nobody(
    engine, world, clock, ports
) -> None:
    ports["moves"].put(move_snap("mv4", "tony", notify_user_ids=()), AUDIENCE)
    _, hooks, _, _ = f.wire(engine, clock, **ports)
    await hooks.on_move_created.fire("mv4")
    assert nudged(world) == {}


class RecordingPush:
    def __init__(self) -> None:
        self.sent: list[tuple[tuple[str, ...], str, dict[str, str]]] = []

    async def push(self, user_ids, title, body, data) -> None:
        self.sent.append((tuple(user_ids), title, dict(data)))


async def test_every_stored_notification_is_also_pushed(
    engine, world, clock, ports
) -> None:
    push = RecordingPush()
    _, hooks, _, _ = f.wire(engine, clock, push=push, **ports)
    await hooks.on_move_created.fire("mv1")
    got = nudged(world)
    assert {users[0] for users, _, _ in push.sent} == set(got)
    assert all(data["move_id"] == "mv1" for _, _, data in push.sent)
