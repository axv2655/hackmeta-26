"""Tendency tab: how long the creator's Moves usually last (domain facts,
the Muse agent with its fallback, and one HTTP round trip)."""

import asyncio
from dataclasses import replace
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.container import Container
from app.domain.move_tendency import (
    PastMove,
    Tendency,
    format_duration,
    template_line,
    tendency,
)
from app.muse.agents.move_tendency import MoveTendencies
from app.muse.client import FakeMuseClient
from app.tables import Move, MoveAudience, MoveParticipant
from tests.muse import factories as f
from tests.muse.factories import T0, mark_snap, move_snap
from tests.muse.fakes import FixedClock

pytestmark = pytest.mark.anyio

ANISH = {"X-User-Id": "anish"}


def past(mark: str, minutes: float, *, category: str = "coffee", days: int = 1):
    start = T0 - timedelta(days=days)
    return PastMove(mark, category, start, start + timedelta(minutes=minutes))


# --- Domain ----------------------------------------------------------------


def test_same_mark_wins_over_category_and_all() -> None:
    history = [past("kumo", 120), past("kumo", 110), past("other", 30)]
    assert tendency(history, "kumo", "coffee") == Tendency(115, "mark", 2)


def test_falls_back_to_category_then_all() -> None:
    by_category = [past("a", 60), past("b", 90), past("c", 20, category="food")]
    assert tendency(by_category, "kumo", "coffee") == Tendency(75, "category", 2)
    by_all = [past("a", 40, category="food"), past("b", 50, category="games")]
    assert tendency(by_all, "kumo", "coffee") == Tendency(45, "all", 2)


def test_no_tendency_without_enough_history() -> None:
    assert tendency([], "kumo", "coffee") is None
    assert tendency([past("kumo", 90)], "kumo", "coffee") is None


def test_stale_and_tiny_moves_do_not_count() -> None:
    # Auto-ended (>= 3 h) and accidental (< 10 min) Moves are ignored.
    history = [past("kumo", 200), past("kumo", 5), past("kumo", 60)]
    assert tendency(history, "kumo", "coffee") is None


def test_format_duration_and_template_line() -> None:
    assert [format_duration(m) for m in (12, 45, 60, 95, 120, 150)] == [
        "~10m",
        "~45m",
        "~1h",
        "~1.5h",
        "~2h",
        "~2.5h",
    ]
    line = template_line("Tony", "Kumo", "coffee", Tendency(118, "mark", 4))
    assert line == "Tony's Kumo Moves usually last ~2h"
    assert template_line("Tony", "Kumo", "coffee", Tendency(90, "category", 2)) == (
        "Tony's coffee Moves usually last ~1.5h"
    )
    assert template_line("Tony", "Kumo", "coffee", Tendency(45, "all", 2)) == (
        "Tony's Moves usually last ~45m"
    )


# --- Agent -----------------------------------------------------------------


def ended_move(session, mid: str, creator: str, mark: str, minutes: int, days: int):
    start = T0 - timedelta(days=days)
    session.add(
        Move(
            id=mid,
            creator_id=creator,
            mark_id=mark,
            text="matcha",
            category="coffee",
            status="ended",
            starts_at=start,
            ends_at=start + timedelta(minutes=minutes),
            created_at=start,
        )
    )


@pytest.fixture
def world(session):
    f.users(session, "tony", "anish")
    f.mark_row(session, "kumo")
    ended_move(session, "old1", "tony", "kumo", 120, 7)
    ended_move(session, "old2", "tony", "kumo", 115, 14)
    session.commit()
    return session


LIVE = move_snap("now", "tony", mark=mark_snap("kumo"))


def tendencies(engine, client: FakeMuseClient, *, deterministic=False):
    lane = f.lane(engine, Container(clock=FixedClock(T0)), client)
    lane.runner.deterministic = deterministic
    return MoveTendencies(lane)


async def settle(agent: MoveTendencies) -> None:
    await asyncio.gather(*list(agent._tasks))


async def test_template_at_once_and_no_model_call_when_deterministic(
    engine, world
) -> None:
    client = FakeMuseClient({"move_tendency": {"lines": {"t1": "never asked"}}})
    agent = tendencies(engine, client, deterministic=True)
    notes = await agent.move_tendencies([LIVE])
    note = notes["now"]
    assert note.line == "Tony's Kumo Moves usually last ~2h"
    assert (note.basis, note.sample_size, note.source) == ("mark", 2, "heuristic")
    assert client.calls == []


async def test_muse_rewrites_the_line_in_the_background(engine, world) -> None:
    line = "Tony's Kumo matcha Moves usually last ~2h"
    client = FakeMuseClient({"move_tendency": {"lines": {"t1": line}}})
    agent = tendencies(engine, client)
    first = await agent.move_tendencies([LIVE])
    assert first["now"].source == "heuristic"  # never waits for the model
    await settle(agent)
    second = await agent.move_tendencies([LIVE])
    assert (second["now"].line, second["now"].source) == (line, "muse")
    assert len(client.calls) == 1  # one batched call, then the cache


@pytest.mark.parametrize(
    "garbage",
    [
        "not json",
        {"lines": {}},
        {"lines": {"t1": "Tony's Kumo Moves usually last ~3h"}},  # wrong number
        {"lines": {"t1": "Tony's Kumo Moves last ~2h!!"}},
    ],
)
async def test_garbage_keeps_the_template(engine, world, garbage) -> None:
    agent = tendencies(engine, FakeMuseClient({"move_tendency": garbage}))
    await agent.move_tendencies([LIVE])
    await settle(agent)
    note = (await agent.move_tendencies([LIVE]))["now"]
    assert note.line == "Tony's Kumo Moves usually last ~2h"
    assert note.source == "heuristic"


async def test_no_note_without_history_or_when_not_live(engine, world) -> None:
    agent = tendencies(engine, FakeMuseClient(), deterministic=True)
    fresh = move_snap("new", "anish", mark=mark_snap("kumo"))
    ended = replace(move_snap("done", "tony", mark=mark_snap("kumo")), status="ended")
    assert await agent.move_tendencies([fresh, ended]) == {}


# --- HTTP ------------------------------------------------------------------


def test_move_detail_carries_the_tendency(engine, world, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "MUSE_DETERMINISTIC", True)
    world.add(
        Move(
            id="now",
            creator_id="tony",
            mark_id="kumo",
            text="matcha run",
            category="coffee",
            starts_at=T0 - timedelta(minutes=40),
            created_at=T0 - timedelta(minutes=40),
        )
    )
    world.add(
        MoveParticipant(
            move_id="now",
            user_id="tony",
            status="there",
            joined_via="creator",
            joined_at=T0,
        )
    )
    world.add(MoveAudience(move_id="now", user_id="anish"))
    world.commit()

    app, _ = f.make_app(engine, FixedClock(T0))
    with TestClient(app) as http:
        body = http.get("/api/v1/moves/now", headers=ANISH).json()
        assert body["tendency"] == {
            "line": "Tony's Kumo Moves usually last ~2h",
            "typical_minutes": 118,
            "basis": "mark",
            "sample_size": 2,
            "source": "heuristic",
        }
        # The old, ended Moves never carry a tab (and are not shown to Anish).
        assert http.get("/api/v1/moves/old1", headers=ANISH).status_code == 404
