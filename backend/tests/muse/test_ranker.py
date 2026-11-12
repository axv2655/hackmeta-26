"""M6: Move ranker and MuseGateway.rank_moves."""

import pytest

from app.container import Container
from app.muse.agents.move_ranker import MoveRanker
from app.muse.client import FakeMuseClient
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


def ranker(engine, answer=None) -> tuple[MoveRanker, FakeMuseClient]:
    client = FakeMuseClient({"move_ranker": answer} if answer is not None else {})
    lane = f.lane(engine, Container(clock=FixedClock(T0)), client)
    return MoveRanker(lane, wait=True), client


def alias_of(prompt: str) -> dict[str, str]:
    """Map visible place names back to the move aliases in the prompt."""
    rows = prompt.split("Moves:\n")[1].splitlines()
    return {row.split(" | ")[2]: row.split(" | ")[0] for row in rows}


async def test_valid_output_parses_and_restores_names(engine, world) -> None:
    def answer(system, prompt):
        a = alias_of(prompt)
        return {
            "ranked": [
                {"move": a["Lunch"], "reason": "{u3} · lunch crew"},
                {"move": a["Kumo"], "reason": "{u1} + {u2} · matcha"},
                {"move": a["Pickle"], "reason": "open game"},
            ]
        }

    r, _ = ranker(engine, answer)
    ranked = await r.rank_moves("anish", MOVES)
    assert [x.move_id for x in ranked] == ["lunch", "kumo", "pickle"]
    assert ranked[1].reason.startswith("Tony + Priya")


async def test_missing_and_duplicate_ids_are_repaired(engine, world) -> None:
    def answer(system, prompt):
        a = alias_of(prompt)
        return {
            "ranked": [
                {"move": a["Lunch"], "reason": "x"},
                {"move": a["Lunch"], "reason": "dup"},
                {"move": "m99", "reason": "bogus"},
            ]
        }

    r, _ = ranker(engine, answer)
    ranked = await r.rank_moves("anish", MOVES)
    ids = [x.move_id for x in ranked]
    assert ids[0] == "lunch" and sorted(ids) == sorted(m.id for m in MOVES)
    assert len(ids) == len(set(ids)) == 3
    assert ids[1:] == ["kumo", "pickle"]  # the rest in fallback order


async def test_garbage_falls_back_to_max_participant_affinity(engine, world) -> None:
    r, client = ranker(engine, "garbage")
    ranked = await r.rank_moves("anish", MOVES)
    # kumo has tony (4 hangouts), lunch has maya (1), pickle has strangers
    assert [x.move_id for x in ranked] == ["kumo", "lunch", "pickle"]
    assert ranked[0].reason == "Tony + Priya" and ranked[2].reason == ""
    assert len(client.calls) == 2


async def test_more_than_15_moves_all_returned_once(engine, world) -> None:
    many = [
        move_snap(f"m{i}", "jordan", created_at=T0 - days(i / 100)) for i in range(20)
    ]
    r, client = ranker(engine, "garbage")
    ranked = await r.rank_moves("anish", many)
    assert [x.move_id for x in ranked] == [f"m{i}" for i in range(20)]  # newest first
    prompt = client.calls[0][1]
    assert len(prompt.split("Moves:\n")[1].splitlines()) == 15


async def test_cache_45s_per_user(engine, world) -> None:
    r, client = ranker(engine, "garbage")
    await r.rank_moves("anish", MOVES)
    await r.rank_moves("anish", list(reversed(MOVES)))
    assert len(client.calls) == 2  # one ranking (call + retry), then cached
    await r.rank_moves("tony", MOVES)
    assert len(client.calls) == 4
    assert await r.rank_moves("anish", []) == []


async def test_gateway_rank_moves_is_bound(engine, world) -> None:
    container, *_ = f.wire(engine, FixedClock(T0))
    ranked = await container.muse.rank_moves("anish", MOVES)  # heuristic first
    assert [x.move_id for x in ranked] == ["kumo", "lunch", "pickle"]


async def test_app_mode_answers_heuristic_now_and_muse_later(engine, world) -> None:
    def answer(system, prompt):
        a = alias_of(prompt)
        return {
            "ranked": [
                {"move": a[n], "reason": "muse"} for n in ("Pickle", "Lunch", "Kumo")
            ]
        }

    client = FakeMuseClient({"move_ranker": answer})
    r = MoveRanker(f.lane(engine, Container(clock=FixedClock(T0)), client))
    first = await r.rank_moves("anish", MOVES)
    assert [x.move_id for x in first] == ["kumo", "lunch", "pickle"]  # heuristic
    assert await r.rank_moves("anish", MOVES) == first  # still ranking
    await r.settle()
    later = await r.rank_moves("anish", MOVES)
    assert [x.move_id for x in later] == ["pickle", "lunch", "kumo"]
    assert len(client.calls) == 1  # one background call, not one per request
