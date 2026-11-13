"""M7: suggestions service, flare / free-time agent, jobs and routes."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.muse.agents.flare import FlareScanner
from app.muse.client import FakeMuseClient
from app.ports import FreeWindow
from app.tables import Notification, Suggestion, TasteProfile, UserSettings
from tests.muse import factories as f
from tests.muse.factories import T0, days, mark_snap, move_snap
from tests.muse.fakes import (
    FakeCalendar,
    FakeMarkGateway,
    FakeMoveGateway,
    FixedClock,
    RecordingPublisher,
)

pytestmark = pytest.mark.anyio

KUMO = mark_snap("kumo", name="Kumo Matcha")
CAFE = mark_snap("cafe", name="Quiet Cafe")


def window(minutes: int) -> FreeWindow:
    return FreeWindow(T0 + timedelta(minutes=10), T0 + timedelta(minutes=10 + minutes))


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    f.users(session, "anish", "priya", "tony")
    f.friends(session, "anish", "priya", "tony")
    f.mark_row(session, "kumo", name="Kumo Matcha")
    f.mark_row(session, "cafe", name="Quiet Cafe")
    f.saved(session, "anish", "kumo", at=T0 - days(3))
    for k in range(3):
        f.hangout(session, "anish", "priya", move_id=f"h{k}", at=T0 - days(k + 2))
    session.commit()
    return session


@pytest.fixture
def ports(clock):
    return {
        "calendar": FakeCalendar({"anish": window(50), "priya": window(50)}),
        "moves": FakeMoveGateway(clock),
        "marks": FakeMarkGateway([KUMO, CAFE]),
        "events": RecordingPublisher(),
    }


def suggestions(session) -> list[Suggestion]:
    session.expire_all()
    return list(session.exec(select(Suggestion)).all())


# --- flare scan ----------------------------------------------------------------


async def test_flare_fallback_stores_suggestion_and_notifies(
    engine, world, clock, ports
) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    assert s.type == "flare" and s.status == "pending"
    assert (
        s.message
        == "You saved Kumo Matcha. You're free til 3:00. Send a flare to Priya?"
    )
    assert s.draft.mark_id == "kumo" and s.draft.kind == "flare"
    assert s.draft.user_ids == ("priya",) and s.draft.fill_minutes == 10
    assert s.chips[0] == "free 2:10–3:00" and s.expires_at == window(50).end
    note = world.exec(select(Notification)).one()
    assert note.type == "muse_flare" and note.data["route"] == f"/suggestion/{s.id}"
    [(users, data)] = ports["events"].of_type("suggestion.created")
    assert users == {"anish"} and data["id"] == s.id
    assert ports["moves"].created == []  # Muse never posts without the tap


async def test_valid_canned_output_parses(engine, world, clock, ports) -> None:
    out = {
        "act": True,
        "type": "flare",
        "mark": "k1",
        "invite": ["u1", "u99"],
        "fill_minutes": 25,
        "text": "Matcha Before Class?",
        "message": "{k1} before class? {u1} is free.",
        "chips": ["{u1} free too"],
    }
    client = FakeMuseClient({"flare": out})
    container, *_ = f.wire(engine, clock, client, **ports)
    s = await container.muse.run_flare_scan("anish")
    assert s.message == "Kumo Matcha before class? Priya is free."
    assert s.draft.text == "matcha before class?"
    assert s.draft.user_ids == ("priya",)  # unknown alias dropped
    assert s.draft.fill_minutes == 10  # window < 60: clamped to 5..10
    assert s.chips == ("Priya free too",)


async def test_act_false_sends_nothing_and_is_remembered(
    engine, world, clock, ports
) -> None:
    client = FakeMuseClient({"flare": {"act": False}})
    container, *_ = f.wire(engine, clock, client, **ports)
    assert await container.muse.run_flare_scan("anish") is None
    assert await container.muse.run_flare_scan("anish") is None
    assert len(client.calls) == 1  # the "no" is memoized
    assert suggestions(world) == []


async def test_daily_cap(engine, world, clock, ports) -> None:
    for i in range(2):
        world.add(
            Suggestion(
                user_id="anish",
                type="free_time",
                payload={},
                created_at=T0 - timedelta(hours=i + 1),
                expires_at=T0,
            )
        )
    world.commit()
    container, *_ = f.wire(engine, clock, **ports)
    assert await container.muse.run_flare_scan("anish") is None
    clock.advance(hours=23)
    ports["calendar"].windows["anish"] = FreeWindow(
        clock.now(), clock.now() + days(0.05)
    )
    assert await container.muse.run_flare_scan("anish") is not None


@pytest.mark.parametrize(
    ("age", "status", "suppressed"),
    [
        (2, "pending", True),
        (4, "expired", False),
        (5, "dismissed", True),
        (8, "dismissed", False),
    ],
)
async def test_recently_proposed_or_dismissed_mark_is_suppressed(
    engine, world, clock, ports, age, status, suppressed
) -> None:
    world.add(
        Suggestion(
            user_id="anish",
            type="flare",
            status=status,
            payload={"mark_id": "kumo"},
            created_at=T0 - days(age),
            expires_at=T0 - days(age - 0.1),
        )
    )
    world.commit()
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    assert (s.type == "free_time") if suppressed else (s.draft.mark_id == "kumo")


@pytest.mark.parametrize(
    ("minutes", "fill"), [(19, None), (45, 10), (90, 10), (240, 10)]
)
async def test_window_math(engine, world, clock, ports, minutes, fill) -> None:
    ports["calendar"].windows["anish"] = window(minutes)
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    assert (s is None) if fill is None else (s.draft.fill_minutes == fill)


async def test_free_friend_and_no_saved_mark_gives_free_time(
    engine, world, clock, ports
) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_free_time_scan("anish")  # ignores saved Marks
    assert s.type == "free_time"
    assert s.message == "You've got 50 min and Priya's free too. Want to start a Move?"
    assert s.draft.user_ids == ("priya",) and s.draft.kind == "move"
    assert s.draft.mark_id == "kumo"  # where anish and priya usually hang out
    assert world.exec(select(Notification)).one().type == "muse_free_time"


@pytest.mark.parametrize("setting", ["proactive_off", "quiet", "no_window"])
async def test_gates(engine, world, clock, ports, setting) -> None:
    s = world.get(UserSettings, "anish")
    if setting == "proactive_off":
        s.muse_proactive = False
    elif setting == "quiet":
        s.quiet_hours = {"start": 13, "end": 15}
    else:
        ports["calendar"].windows.pop("anish")
    world.add(s)
    world.commit()
    container, *_ = f.wire(engine, clock, **ports)
    assert await container.muse.run_flare_scan("anish") is None


async def test_scheduler_jobs_registered_and_scan_all(
    engine, world, clock, ports
) -> None:
    _, _, scheduler, lane = f.wire(engine, clock, **ports)
    jobs = {j.name: j for j in scheduler.jobs}
    assert jobs["muse_flare_scan"].interval_s == 60
    # anish gets a flare; priya (no saved Marks) gets free time with anish
    assert await jobs["muse_flare_scan"].fn() == 2


async def test_expiry_job(engine, world, clock, ports) -> None:
    world.add_all(
        [
            Suggestion(
                id="old",
                user_id="anish",
                type="flare",
                created_at=T0,
                expires_at=T0 - days(0.01),
            ),
            Suggestion(
                id="new",
                user_id="anish",
                type="flare",
                created_at=T0,
                expires_at=T0 + days(0.01),
            ),
        ]
    )
    world.commit()
    _, _, scheduler, _ = f.wire(engine, clock, **ports)
    job = next(j for j in scheduler.jobs if j.name == "muse_expire_suggestions")
    assert await job.fn() == 1
    assert {s.id: s.status for s in suggestions(world)} == {
        "old": "expired",
        "new": "pending",
    }


# --- accept / dismiss ------------------------------------------------------------


async def test_accept_flare_creates_flare_with_fill_deadline(
    engine, world, clock, ports
) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        h = {"X-User-Id": "anish"}
        listed = http.get("/api/v1/suggestions", headers=h).json()
        assert [x["id"] for x in listed] == [s.id]
        assert listed[0]["draft"]["mark"]["id"] == "kumo"
        r = http.post(f"/api/v1/suggestions/{s.id}/accept", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["suggestion"]["status"] == "accepted" and body["move_id"]
        [(creator, draft)] = ports["moves"].created
        assert creator == "anish" and draft.kind == "flare"
        assert draft.fill_minutes == 10 and draft.origin == "saved_flare"
        assert draft.notify_user_ids == ("priya",) and draft.origin_ref == s.id
        assert ports["moves"].get(body["move_id"]).fill_deadline is not None
        again = http.post(f"/api/v1/suggestions/{s.id}/accept", headers=h)
        assert again.status_code == 409
        assert http.get("/api/v1/suggestions", headers=h).json() == []
        other = http.post(
            f"/api/v1/suggestions/{s.id}/dismiss", headers={"X-User-Id": "priya"}
        )
        assert other.status_code == 404


async def test_accept_with_edits(engine, world, clock, ports) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        http.post(
            f"/api/v1/suggestions/{s.id}/accept",
            headers={"X-User-Id": "anish"},
            json={"text": "kumo rn?", "user_ids": ["priya", "tony"]},
        )
    [(_, draft)] = ports["moves"].created
    assert draft.text == "kumo rn?" and draft.notify_user_ids == ("priya", "tony")


async def test_accept_nobody_bit_joins_and_ends(engine, world, clock, ports) -> None:
    ports["moves"].put(move_snap("own", "anish"))
    world.add(
        Suggestion(
            id="nb",
            user_id="anish",
            type="nobody_bit",
            created_at=T0,
            expires_at=T0 + days(1),
            payload={
                "message": "Quiet one.",
                "target_move_id": "pickle",
                "own_move_id": "own",
            },
        )
    )
    world.commit()
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        r = http.post("/api/v1/suggestions/nb/accept", headers={"X-User-Id": "anish"})
    assert r.json()["move_id"] == "pickle"
    assert ports["moves"].added == [("pickle", "anish", "going", "tap")]
    assert ports["moves"].ended == [("own", "nobody_bit")]


async def test_accept_revive_returns_draft_and_dismiss(
    engine, world, clock, ports
) -> None:
    draft = {
        "mark_id": "kumo",
        "text": "climb thursday?",
        "category": "fitness",
        "user_ids": ["priya"],
    }
    world.add_all(
        [
            Suggestion(
                id="rv",
                user_id="anish",
                type="revive",
                created_at=T0,
                expires_at=T0 + days(1),
                payload={"message": "m", "draft": draft},
            ),
            Suggestion(
                id="d",
                user_id="anish",
                type="flare",
                created_at=T0,
                expires_at=T0 + days(1),
                payload={"message": "m"},
            ),
        ]
    )
    world.commit()
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        h = {"X-User-Id": "anish"}
        body = http.post("/api/v1/suggestions/rv/accept", headers=h).json()
        assert body["move_id"] is None and body["draft"]["text"] == "climb thursday?"
        assert ports["moves"].created == []
        d = http.post("/api/v1/suggestions/d/dismiss", headers=h).json()
        assert d["status"] == "dismissed"


# --- fill clamp, forced scans, payload extras, honest source ---------------------


@pytest.mark.parametrize(("minutes", "asked"), [(240, 30), (240, None), (45, 2)])
async def test_fill_always_5_to_10(engine, world, clock, ports, minutes, asked) -> None:
    out = {
        "act": True,
        "type": "flare",
        "mark": "k1",
        "invite": ["u1"],
        "fill_minutes": asked,
        "text": "matcha?",
        "message": "{k1}?",
    }
    ports["calendar"].windows["anish"] = window(minutes)
    container, *_ = f.wire(engine, clock, FakeMuseClient({"flare": out}), **ports)
    s = await container.muse.run_flare_scan("anish")
    assert 5 <= s.draft.fill_minutes <= 10
    assert s.draft.fill_minutes == (5 if asked == 2 else 10)


async def test_force_bypasses_memo_and_daily_cap(engine, world, clock, ports) -> None:
    client = FakeMuseClient({"flare": {"act": False}})
    container, _, _, lane = f.wire(engine, clock, client, **ports)
    flares = FlareScanner(lane)
    assert await flares.run_flare_scan("anish") is None
    assert await flares.run_flare_scan("anish") is None
    assert len(client.calls) == 1  # memoized
    forced = await flares.run_flare_scan("anish", force=True)
    assert forced is not None  # memo skipped; Muse's "no" -> heuristic card
    assert forced.draft.source == "heuristic"

    for i in range(2):
        world.add(
            Suggestion(
                user_id="anish",
                type="flare",
                payload={"mark_id": "kumo"},
                created_at=T0 - timedelta(hours=i + 1),
                expires_at=T0,
            )
        )
    world.commit()
    scanner = FlareScanner(f.lane(engine, f.wire(engine, clock, **ports)[0]))
    assert await scanner.run_flare_scan("anish") is None  # daily cap
    forced = await scanner.run_flare_scan("anish", force=True)
    assert forced is not None and forced.draft.mark_id == "kumo"  # cooldown too


async def test_payload_has_window_and_extras_on_the_api(
    engine, world, clock, ports
) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    row = world.get(Suggestion, s.id)
    assert row.payload["window_start"] == window(50).start.isoformat()
    assert row.payload["window_end"] == window(50).end.isoformat()
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        [got] = http.get("/api/v1/suggestions", headers={"X-User-Id": "anish"}).json()
    assert got["window_end"] == window(50).end.isoformat()
    assert got["fill_minutes"] == 10 and got["group_id"] is None
    assert got["target_move_id"] is None


async def test_fallback_draft_says_heuristic_and_muse_says_muse(
    engine, world, clock, ports
) -> None:
    container, *_ = f.wire(engine, clock, FakeMuseClient(default="garbage"), **ports)
    s = await container.muse.run_flare_scan("anish")
    assert s.draft.source == "heuristic"

    out = {"act": True, "type": "flare", "mark": "k1", "message": "{k1}?"}
    client = FakeMuseClient({"flare": out})
    container, *_ = f.wire(engine, clock, client, **ports)
    s = await container.muse.demo_flare_scan("anish")
    assert s.draft.source == "muse"


async def test_taste_summary_in_prompt(engine, world, clock, ports) -> None:
    world.add(
        TasteProfile(
            subject_type="user",
            subject_id="anish",
            summary="likes quiet matcha spots",
            updated_at=T0,
        )
    )
    world.commit()
    client = FakeMuseClient({"flare": {"act": False}})
    container, *_ = f.wire(engine, clock, client, **ports)
    await container.muse.run_flare_scan("anish")
    [(_, prompt)] = client.calls
    assert "User taste: likes quiet matcha spots" in prompt


async def test_accept_clamps_edited_fill(engine, world, clock, ports) -> None:
    container, *_ = f.wire(engine, clock, **ports)
    s = await container.muse.run_flare_scan("anish")
    app, _ = f.make_app(engine, clock, **ports)
    with TestClient(app) as http:
        r = http.post(
            f"/api/v1/suggestions/{s.id}/accept",
            headers={"X-User-Id": "anish"},
            json={"fill_minutes": 30},
        )
    assert r.status_code == 200
    [(_, draft)] = ports["moves"].created
    assert draft.kind == "flare" and draft.fill_minutes == 10
