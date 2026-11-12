"""M11: intent parser and route suggestions."""

from dataclasses import replace

import pytest
from sqlmodel import select

from app.muse.agents.intent import heuristic, parse_intent
from app.muse.agents.route import eligible_pair, walkable
from app.muse.client import FakeMuseClient
from app.muse.runner import MuseRunner
from app.ports import Intent
from app.tables import Notification, Suggestion, User
from tests.muse import factories as f
from tests.muse.factories import T0, mark_snap, move_snap
from tests.muse.fakes import FakeMoveGateway, FixedClock

pytestmark = pytest.mark.anyio


# --- intent ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("utterance", "expected"),
    [
        (
            "Hey Meta, start a Move, getting boba, ask the usual crew",
            Intent("start_move", "getting boba", "usual crew"),
        ),
        (
            "start a flare: climbing at 6 with maya and dev",
            Intent("start_move", "climbing at 6", "maya and dev"),
        ),
        (
            "ok meta post a move studying at founders",
            Intent("start_move", "studying at founders", None),
        ),
        (
            "I'm getting tacos, who's down?",
            Intent("start_move", "i'm getting tacos, who's down?", None),
        ),
        (
            "Hey Meta, what's the weather?",
            Intent("none", "Hey Meta, what's the weather?", None),
        ),
        ("play some music", Intent("none", "play some music", None)),
    ],
)
def test_intent_heuristic_phrases(utterance, expected) -> None:
    assert heuristic(utterance) == expected


def runner(**responses) -> tuple[MuseRunner, FakeMuseClient]:
    client = FakeMuseClient(responses)
    return MuseRunner(client, clock=lambda: FixedClock(T0)), client


async def test_intent_valid_canned_output_parses() -> None:
    r, _ = runner(
        intent={
            "intent": "start_move",
            "text": "Getting Boba",
            "audience_hint": "The Usual Crew",
        }
    )
    got = await parse_intent(r, "yo start a move boba w the crew")
    assert got == Intent("start_move", "getting boba", "the usual crew")


@pytest.mark.parametrize(
    "answer", ["garbage", {"intent": "start_move", "text": ""}, {"intent": "dance"}]
)
async def test_intent_garbage_falls_back_to_heuristic(answer) -> None:
    r, client = runner(intent=answer)
    got = await parse_intent(
        r, "Hey Meta, start a Move, getting boba, ask the usual crew"
    )
    assert got == Intent("start_move", "getting boba", "usual crew")
    assert len(client.calls) == 2


# --- route ----------------------------------------------------------------------

KUMO = replace(mark_snap("kumo", name="Kumo Matcha"), address="123 Main St, Richardson")


def test_route_eligibility_rules() -> None:
    assert eligible_pair([("a", "campus"), ("b", "campus")], KUMO) == (
        "a",
        "b",
        "campus",
    )
    assert eligible_pair([("a", "campus"), ("b", "downtown")], KUMO) is None
    assert eligible_pair([("a", "campus"), ("b", None)], KUMO) is None
    # walkable: the Mark is in the same area
    assert walkable("Richardson", KUMO)
    assert eligible_pair([("a", "Richardson"), ("b", "Richardson")], KUMO) is None
    assert eligible_pair([("a", "campus")], KUMO) is None


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    f.users(session, "tony", "anish", "dev", "maya", "out")
    for uid, area in [
        ("anish", "campus"),
        ("dev", "campus"),
        ("maya", "campus"),
        ("out", "campus"),
    ]:
        session.get(User, uid).last_area = area
    session.commit()
    return session


@pytest.fixture
def moves(clock):
    m = FakeMoveGateway(clock)
    m.put(
        move_snap(
            "mv", "tony", mark=KUMO, there=["maya"], going=["anish", "dev", "out"]
        ),
        {"anish", "dev", "maya"},
    )  # "out" is not in the audience
    return m


async def test_route_suggests_once_to_one_of_the_pair(
    engine, world, clock, moves
) -> None:
    container, *_ = f.wire(engine, clock, moves=moves)
    s = await container.muse.run_route("mv", [])
    assert s.type == "route" and s.user_id == "anish"
    assert (
        s.message
        == "You and Dev are both heading to Kumo Matcha from campus. Go together?"
    )
    assert s.draft.user_ids == ("dev",) and s.draft.mark_id == "kumo"
    assert await container.muse.run_route("mv", []) is None  # one per Move and pair
    world.expire_all()
    assert world.exec(select(Notification)).one().type == "muse_route"


async def test_route_respects_given_users_and_audience(
    engine, world, clock, moves
) -> None:
    container, *_ = f.wire(engine, clock, moves=moves)
    # maya is "there", out is not in the audience: no pair with anish
    assert await container.muse.run_route("mv", ["anish", "maya", "out"]) is None


async def test_route_valid_canned_output_parses(engine, world, clock, moves) -> None:
    client = FakeMuseClient(
        {
            "route": {
                "message": "{u2} is also going to {k1}. Ride?",
                "chips": ["both from campus"],
            }
        }
    )
    container, *_ = f.wire(engine, clock, client, moves=moves)
    s = await container.muse.run_route("mv", [])
    assert s.message == "Dev is also going to Kumo Matcha. Ride?"
    assert s.chips == ("both from campus",)


async def test_route_garbage_falls_back(engine, world, clock, moves) -> None:
    client = FakeMuseClient({"route": "garbage"})
    container, *_ = f.wire(engine, clock, client, moves=moves)
    s = await container.muse.run_route("mv", [])
    assert s.message.startswith("You and Dev are both heading to Kumo Matcha")
    assert len(client.calls) == 2


async def test_route_runs_on_join(engine, world, clock, moves) -> None:
    _, hooks, _, _ = f.wire(engine, clock, moves=moves)
    await hooks.on_move_joined.fire("mv", "dev")
    world.expire_all()
    assert [s.type for s in world.exec(select(Suggestion)).all()] == ["route"]


async def test_gateway_parse_intent_bound(engine, clock) -> None:
    container, *_ = f.wire(engine, clock)
    got = await container.muse.parse_intent("Hey Meta, start a Move, getting boba")
    assert got == Intent("start_move", "getting boba", None)
