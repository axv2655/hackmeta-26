"""M6: deterministic Move ranker and MuseGateway.rank_moves."""

import random

import pytest

from app.container import Container
from app.muse.agents.move_ranker import MoveRanker
from app.muse.client import FakeMuseClient
from app.tables import MarkRanking
from tests.muse import factories as f
from tests.muse.factories import T0, days, mark_snap, move_snap
from tests.muse.fakes import FixedClock

pytestmark = pytest.mark.anyio


@pytest.fixture
def world(session):
    f.users(session, "anish", "tony", "priya", "jordan", "casey", "maya")
    for i, (who, n) in enumerate([("tony", 4), ("priya", 2), ("maya", 1)]):
        for k in range(n):
            f.hangout(session, "anish", who, move_id=f"h{i}{k}", at=T0 - days(k + 1))
    session.commit()
    return session


MOVES = [
    move_snap(
        "pickle",
        "jordan",
        going=["casey"],
        created_at=T0 - days(0.001),
        mark=mark_snap("pickle", category="fitness"),
    ),
    move_snap(
        "kumo",
        "tony",
        there=["priya"],
        created_at=T0 - days(0.02),
        mark=mark_snap("kumo"),
    ),
    move_snap(
        "lunch",
        "maya",
        created_at=T0 - days(0.01),
        mark=mark_snap("lunch", category="food"),
    ),
]


def ranker(engine) -> tuple[MoveRanker, FakeMuseClient]:
    client = FakeMuseClient({"move_ranker": "never asked"})
    lane = f.lane(engine, Container(clock=FixedClock(T0)), client)
    return MoveRanker(lane), client


async def test_closest_people_first_with_names_and_no_model_call(engine, world) -> None:
    r, client = ranker(engine)
    ranked = await r.rank_moves("anish", MOVES)
    # kumo has tony (4 hangouts) + priya, lunch has maya (1), pickle has strangers
    assert [x.move_id for x in ranked] == ["kumo", "lunch", "pickle"]
    assert ranked[0].reason == "Tony + Priya"
    assert ranked[1].reason == "Maya"
    assert client.calls == []


async def test_same_order_whatever_the_input_order(engine, world) -> None:
    r, _ = ranker(engine)
    first = await r.rank_moves("anish", MOVES)
    shuffled = list(MOVES)
    random.Random(7).shuffle(shuffled)
    assert await r.rank_moves("anish", shuffled) == first
    assert await r.rank_moves("anish", list(reversed(MOVES))) == first


async def test_a_loved_place_climbs_and_says_why(engine, world) -> None:
    world.add(
        MarkRanking(
            user_id="anish", mark_id="pickle", category="fitness", position=0, score=9.5
        )
    )
    world.commit()
    r, _ = ranker(engine)
    ranked = await r.rank_moves("anish", MOVES)
    assert [x.move_id for x in ranked] == ["kumo", "pickle", "lunch"]
    assert ranked[1].reason == "you loved Pickle"


async def test_a_disliked_place_sinks(engine, world) -> None:
    world.add(
        MarkRanking(
            user_id="anish", mark_id="lunch", category="food", position=3, score=1.0
        )
    )
    world.commit()
    r, _ = ranker(engine)
    ranked = await r.rank_moves("anish", MOVES)
    assert [x.move_id for x in ranked] == ["kumo", "pickle", "lunch"]


async def test_closing_fill_timer_is_the_reason(engine, world) -> None:
    flare = move_snap(
        "flare",
        "jordan",
        kind="flare",
        created_at=T0 - days(0.3),
        fill_deadline=T0 + days(3 / 1440),
        mark=mark_snap("court", category="fitness"),
    )
    r, _ = ranker(engine)
    ranked = await r.rank_moves("anish", [flare])
    assert ranked[0].reason == "3 min to join"


async def test_many_moves_all_returned_once_newest_first_on_ties(engine, world) -> None:
    many = [
        move_snap(f"m{i}", "jordan", created_at=T0 - days(i / 100)) for i in range(20)
    ]
    r, _ = ranker(engine)
    ranked = await r.rank_moves("anish", many)
    assert [x.move_id for x in ranked] == [f"m{i}" for i in range(20)]
    assert await r.rank_moves("anish", []) == []


async def test_gateway_rank_moves_is_bound(engine, world) -> None:
    container, *_ = f.wire(engine, FixedClock(T0))
    ranked = await container.muse.rank_moves("anish", MOVES)
    assert [x.move_id for x in ranked] == ["kumo", "lunch", "pickle"]
