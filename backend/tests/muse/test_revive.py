"""M9: pseudo-group detection, persistence, revive agent and routes."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.domain import pseudo_groups as pg
from app.muse.client import FakeMuseClient
from app.muse.pseudo_groups import owner_outings, upsert
from app.tables import Notification, PseudoGroup, Suggestion, TasteProfile
from tests.muse import factories as f
from tests.muse.factories import T0, days
from tests.muse.fakes import FixedClock

pytestmark = pytest.mark.anyio

# T0 is Thursday 2 pm. Weeks back from T0.
WEEK = timedelta(days=7)


def seed_history(session) -> None:
    """The 15.1 patterns, 8 weeks back."""
    f.users(session, "anish", "priya", "tony", "maya", "dev", "sam")
    f.mark_row(session, "kumo", name="Kumo Matcha")
    f.mark_row(session, "chipotle", name="Chipotle", category="food")
    f.mark_row(session, "gym", name="Summit Climbing", category="fitness")
    for w in range(8):
        # matcha with priya Mon + Wed afternoons, tony on Mondays
        mon = T0 - w * WEEK - days(3)
        f.group_hangout(session, ["anish", "priya", "tony"], move_id=f"mat{w}a", at=mon)
        f.group_hangout(
            session, ["anish", "priya"], move_id=f"mat{w}b", at=mon + days(2)
        )
        # lunch with tony + maya on Tuesdays
        f.group_hangout(
            session,
            ["anish", "tony", "maya"],
            move_id=f"lun{w}",
            at=T0 - w * WEEK - days(2),
            mark_id="chipotle",
            category="food",
            hour_bucket="lunch",
        )
    for w in range(4, 8):  # climbing Thursdays, stopped 4 weeks ago
        f.group_hangout(
            session,
            ["anish", "maya", "dev"],
            move_id=f"clb{w}",
            at=T0 - w * WEEK,
            mark_id="gym",
            category="fitness",
            hour_bucket="evening",
        )
    f.hangout(session, "anish", "sam", move_id="hs", at=T0 - 6 * WEEK)
    session.commit()


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    seed_history(session)
    return session


def test_clustering_on_hand_built_hangouts(world) -> None:
    clusters = pg.detect("anish", owner_outings(world, "anish"), T0)
    by_members = {c.key: c for c in clusters}
    assert set(by_members) == {("priya",), ("maya", "tony"), ("dev", "maya")}
    climbing = by_members[("dev", "maya")]
    assert climbing.fading and climbing.usual_gap_days == 7.0
    assert climbing.pattern == {
        "categories": ["fitness"],
        "weekdays": [3],
        "hour_buckets": ["evening"],
        "mark_ids": ["gym"],
    }
    matcha = by_members[("priya",)]  # "+ tony sometimes" still the same crew
    assert len(matcha.outings) == 16 and not matcha.fading
    assert matcha.pattern["weekdays"] == [0, 2]
    assert not by_members[("maya", "tony")].fading
    assert ("sam",) not in by_members  # one hangout is not a pattern


@pytest.mark.parametrize(
    ("gap_days", "since_days", "fading"),
    [
        (7, 17, False),
        (7, 18, True),
        (2, 13, False),
        (2, 15, True),
        (20, 49, False),
        (20, 51, True),
    ],
)
def test_fading_threshold(gap_days, since_days, fading) -> None:
    times = [T0 - days(since_days + gap_days * i) for i in (3, 2, 1, 0)]
    assert pg.is_fading(times, T0)[0] is fading


def test_weekly_history_for_sparkline() -> None:
    hist = pg.weekly_history([T0 - days(1), T0 - days(2), T0 - days(15)], T0, weeks=4)
    assert hist == [0, 1, 0, 2]  # 15 days ago is in the third week back


def test_detection_is_persisted_and_stable(world) -> None:
    pairs = upsert(world, "anish", T0)
    world.commit()
    rows = {tuple(r.member_ids): r for r in world.exec(select(PseudoGroup)).all()}
    assert set(rows) == {("priya",), ("maya", "tony"), ("dev", "maya")}
    climbing = rows[("dev", "maya")]
    assert climbing.fading and climbing.label == "fitness crew"
    assert climbing.last_hangout_at == T0 - 4 * WEEK and climbing.strength > 0
    first_id = climbing.id
    upsert(world, "anish", T0 + days(1))
    world.commit()
    assert world.get(PseudoGroup, first_id) is not None  # same row kept
    assert len(pairs) == 3


async def test_revive_scan_refreshes_and_stores_suggestion(
    engine, world, clock
) -> None:
    container, *_ = f.wire(engine, clock)
    s = await container.muse.run_revive_scan("anish")
    assert s.type == "revive"
    assert s.message == (
        "You, Dev and Maya used to hit Summit Climbing on Thursdays. "
        "Want to get everyone back together?"
    )
    assert s.draft.mark_id == "gym" and set(s.draft.user_ids) == {"dev", "maya"}
    assert "last together 4 weeks ago" in s.chips
    world.expire_all()
    note = world.exec(select(Notification)).one()
    assert note.type == "muse_revive"
    assert len(world.exec(select(PseudoGroup)).all()) == 3


async def test_weekly_cap(engine, world, clock) -> None:
    container, *_ = f.wire(engine, clock)
    assert await container.muse.run_revive_scan("anish") is not None
    clock.advance(days=6)
    assert await container.muse.run_revive_scan("anish") is None
    clock.advance(days=2)
    assert await container.muse.run_revive_scan("anish") is not None


async def test_valid_canned_output_parses(engine, world, clock) -> None:
    client = FakeMuseClient(
        {
            "revive": {
                "message": "{u1} + {u2} miss {k1}. Thursday?",
                "text": "Climb Thursday? Been Too Long",
                "chips": ["4 weeks"],
            },
            "pseudo_group_label": {"label": "Thursday Climbing Crew"},
        }
    )
    container, *_ = f.wire(engine, clock, client)
    s = await container.muse.run_revive_scan("anish")
    assert s.message == "Dev + Maya miss Summit Climbing. Thursday?"
    assert s.draft.text == "climb thursday? been too long"
    world.expire_all()
    labels = {r.label for r in world.exec(select(PseudoGroup)).all()}
    assert "thursday climbing crew" in labels


async def test_garbage_output_returns_fallback(engine, world, clock) -> None:
    client = FakeMuseClient(default="garbage")
    container, *_ = f.wire(engine, clock, client)
    s = await container.muse.run_revive_scan("anish")
    assert s.message.startswith("You, Dev and Maya used to hit Summit Climbing")
    assert s.draft.text == "working out at summit climbing, who's in?"


async def test_no_fading_group_no_suggestion(engine, session, clock) -> None:
    f.users(session, "anish", "priya")
    f.mark_row(session, "kumo")
    for w in range(4):
        f.hangout(
            session, "anish", "priya", move_id=f"m{w}", at=T0 - w * WEEK - days(1)
        )
    session.commit()
    container, *_ = f.wire(engine, clock)
    assert await container.muse.run_revive_scan("anish") is None
    assert session.exec(select(Suggestion)).all() == []


def test_routes(engine, world, clock) -> None:
    upsert(world, "anish", T0)
    world.commit()
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        h = {"X-User-Id": "anish"}
        groups = http.get("/api/v1/pseudo-groups", headers=h).json()
        climbing = next(g for g in groups if g["fading"])
        assert [m["first_name"] for m in climbing["members"]] == ["Dev", "Maya"]
        assert len(climbing["history"]) == 12 and sum(climbing["history"]) == 4
        assert climbing["history"][-4:] == [0, 0, 0, 0]
        draft = http.post(
            f"/api/v1/pseudo-groups/{climbing['id']}/revive", headers=h
        ).json()
        assert draft["mark"]["id"] == "gym" and draft["user_ids"] == ["dev", "maya"]
        other = http.post(
            f"/api/v1/pseudo-groups/{climbing['id']}/revive",
            headers={"X-User-Id": "maya"},
        )
        assert other.status_code == 404
        assert (
            http.get("/api/v1/pseudo-groups", headers={"X-User-Id": "maya"}).json()
            == []
        )
    assert world.exec(select(Suggestion)).all() == []  # revive route stores nothing


def test_seed_step_detects_groups_and_writes_anish_taste(session) -> None:
    from app.seed import ids
    from app.seed import muse as muse_seed

    f.users(session, ids.ANISH, ids.MAYA, ids.DEV)
    f.mark_row(session, "gym", category="fitness")
    for w in range(4, 8):
        f.group_hangout(
            session,
            [ids.ANISH, ids.MAYA, ids.DEV],
            move_id=f"c{w}",
            at=T0 - w * WEEK,
            mark_id="gym",
            category="fitness",
        )
    session.commit()
    muse_seed.seed(session, FixedClock(T0))
    session.commit()
    [taste] = session.exec(select(TasteProfile)).all()
    assert taste.summary == "likes quiet aesthetic coffee shops, not chains"
    groups = session.exec(select(PseudoGroup)).all()
    owners = {g.owner_id: g for g in groups}
    assert owners[ids.ANISH].fading and owners[ids.ANISH].label == "fitness crew"
