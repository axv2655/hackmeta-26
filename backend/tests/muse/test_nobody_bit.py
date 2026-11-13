"""M10: nobody-bit agent and trigger job."""

from datetime import timedelta

import pytest
from sqlmodel import select

from app.muse.agents.nobody_bit import says_nobody_came
from app.muse.client import FakeMuseClient
from app.tables import Move, MoveParticipant, Notification, Suggestion
from tests.muse import factories as f
from tests.muse.factories import T0, days, mark_snap, move_snap
from tests.muse.fakes import FakeMoveGateway, FakeProximity, FixedClock

pytestmark = pytest.mark.anyio

PICKLE = mark_snap("pickle", name="Pickleball Court", category="fitness")
KUMO = mark_snap("kumo", name="Kumo Matcha")


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    f.users(session, "anish", "tony", "priya", "jordan", "casey", "morgan", "taylor")
    for k in range(3):
        f.hangout(session, "anish", "tony", move_id=f"h{k}", at=T0 - days(k + 1))
    session.commit()
    return session


@pytest.fixture
def moves(clock):
    m = FakeMoveGateway(clock)
    m.put(
        move_snap(
            "own",
            "anish",
            text="boba anyone?",
            kind="flare",
            mark=mark_snap("boba", name="Fat Straws"),
        )
    )
    return m


def stored(session) -> list[Suggestion]:
    session.expire_all()
    return list(session.exec(select(Suggestion)).all())


async def test_no_candidates_sends_nothing(engine, world, clock, moves) -> None:
    container, *_ = f.wire(engine, clock, moves=moves)
    assert await container.muse.run_nobody_bit("own") is None
    assert stored(world) == []
    assert world.exec(select(Notification)).all() == []


async def test_one_visible_candidate(engine, world, clock, moves) -> None:
    moves.put(move_snap("kumo", "tony", there=["priya"], mark=KUMO), {"anish"})
    container, *_ = f.wire(engine, clock, moves=moves)
    s = await container.muse.run_nobody_bit("own")
    assert s.type == "nobody_bit"
    assert s.message == "Quiet one. Tony + 1 are at Kumo Matcha. Pull up?"
    assert s.draft.mark_id == "kumo"
    [row] = stored(world)
    assert row.payload["target_move_id"] == "kumo"
    assert row.payload["own_move_id"] == "own"
    world.expire_all()
    assert world.exec(select(Notification)).one().type == "muse_nobody_bit"


async def test_open_move_candidate_from_proximity(engine, world, clock, moves) -> None:
    moves.put(
        move_snap(
            "pb",
            "jordan",
            going=["casey", "morgan", "taylor"],
            mark=PICKLE,
            open=True,
            category="fitness",
        )
    )  # not in audience
    moves.put(move_snap("hidden", "jordan", mark=PICKLE))  # neither: never suggested
    prox = FakeProximity(open_moves={"anish": ["pb", "hidden"]})
    container, *_ = f.wire(engine, clock, moves=moves, proximity=prox)
    s = await container.muse.run_nobody_bit("own")
    assert s.message == (
        "Quiet one. Jordan + 3 are at Pickleball Court and it's open. Pull up?"
    )
    assert "open Move" in s.chips
    assert stored(world)[0].payload["target_move_id"] == "pb"


async def test_valid_canned_output_parses(engine, world, clock, moves) -> None:
    moves.put(move_snap("kumo", "tony", mark=KUMO), {"anish"})
    client = FakeMuseClient(
        {
            "nobody_bit": {
                "act": True,
                "move": "m1",
                "message": "{u1}'s at Kumo rn. Pull up?",
                "chips": ["{u1} there"],
            }
        }
    )
    container, *_ = f.wire(engine, clock, client, moves=moves)
    s = await container.muse.run_nobody_bit("own")
    assert s.message == "Tony's at Kumo rn. Pull up?" and s.chips == ("Tony there",)
    assert s.draft.source == "muse"


@pytest.mark.parametrize(
    "answer",
    [
        "garbage",
        {"act": True, "move": "m1", "message": "Nobody came, sorry. Try Kumo?"},
        {"act": True, "move": "m7", "message": "Go to m7"},
    ],
    ids=["garbage", "nobody_came", "unknown_alias"],
)
async def test_fallback_never_says_nobody_came(
    engine, world, clock, moves, answer
) -> None:
    moves.put(move_snap("kumo", "tony", mark=KUMO), {"anish"})
    client = FakeMuseClient({"nobody_bit": answer})
    container, *_ = f.wire(engine, clock, client, moves=moves)
    s = await container.muse.run_nobody_bit("own")
    assert s.message == "Quiet one. Tony is at Kumo Matcha. Pull up?"
    assert not says_nobody_came(s.message) and len(client.calls) == 2
    assert s.draft.source == "heuristic"


async def test_act_false_and_joined_moves_send_nothing(
    engine, world, clock, moves
) -> None:
    moves.put(move_snap("kumo", "tony", mark=KUMO), {"anish"})
    client = FakeMuseClient({"nobody_bit": {"act": False}})
    container, *_ = f.wire(engine, clock, client, moves=moves)
    assert await container.muse.run_nobody_bit("own") is None
    moves.put(move_snap("busy", "anish", going=["priya"]))
    container2, *_ = f.wire(engine, clock, moves=moves)
    assert await container2.muse.run_nobody_bit("busy") is None


def test_forbidden_phrases() -> None:
    for bad in (
        "nobody came :(",
        "No one showed up",
        "looks like no one joined",
        "nobody's coming",
        "no one bit",
    ):
        assert says_nobody_came(bad), bad
    for ok in ("Quiet one. Tony is at Kumo. Pull up?", "nobody does matcha like kumo"):
        assert not says_nobody_came(ok), ok


async def test_job_finds_quiet_moves_once(engine, world, clock, moves) -> None:
    f.mark_row(world, "boba")
    world.add_all(
        [
            Move(
                id="own",
                creator_id="anish",
                mark_id="boba",
                text="boba?",
                category="coffee",
                kind="flare",
                starts_at=T0 - days(0.01),
                created_at=T0 - days(0.01),
                fill_deadline=T0 - timedelta(minutes=1),
            ),
            Move(
                id="young",
                creator_id="tony",
                mark_id="boba",
                text="x",
                category="coffee",
                starts_at=T0,
                created_at=T0 - timedelta(minutes=10),
            ),
            Move(
                id="joined",
                creator_id="priya",
                mark_id="boba",
                text="x",
                category="coffee",
                starts_at=T0,
                created_at=T0 - timedelta(minutes=30),
            ),
            MoveParticipant(
                move_id="joined",
                user_id="tony",
                status="going",
                joined_via="tap",
                joined_at=T0,
            ),
        ]
    )
    world.commit()
    moves.put(move_snap("kumo", "tony", mark=KUMO), {"anish"})
    _, _, scheduler, _ = f.wire(engine, clock, moves=moves)
    job = next(j for j in scheduler.jobs if j.name == "muse_nobody_bit")
    assert job.interval_s == 60
    assert await job.fn() == 1  # only "own": "young" is <15 min, "joined" has tony
    assert await job.fn() == 0  # handled once
    assert len(stored(world)) == 1
