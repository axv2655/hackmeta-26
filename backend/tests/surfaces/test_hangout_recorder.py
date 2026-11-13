"""S8: HangoutRecorder.on_move_ended (plan A.6)."""

from datetime import timedelta

import pytest
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.container import Container
from app.core.gateways import SqlMoveGateway
from app.hooks import Hooks
from app.services.hangouts import HangoutRecorder
from app.tables import Hangout
from tests.surfaces.factories import T0, add_mark, add_move, add_participant, add_users
from tests.surfaces.fakes import FixedClock, SpyEvents, SpyMuse, SpyNotifier

pytestmark = pytest.mark.anyio

MOVE = "mv1"
END = T0 + timedelta(hours=2)  # Thursday 20:00 UTC, 14:00 CST


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def world(session: Session) -> Session:
    add_users(session, ["ana", "ben", "cal", "dee"])
    add_mark(session, "kumo")
    add_move(session, MOVE, "ana", "kumo", status="ended", ends_at=END)
    # ben overlaps ana; cal arrives after ben left but overlaps ana; dee never arrived
    add_participant(
        session, MOVE, "ben", status="left", left_at=T0 + timedelta(hours=1)
    )
    add_participant(session, MOVE, "cal", arrived_at=T0 + timedelta(hours=1))
    add_participant(session, MOVE, "dee", status="going", arrived_at=None)
    session.commit()
    return session


def make(engine: Engine, notifier=None) -> tuple[HangoutRecorder, Container]:
    clock = FixedClock(END)
    container = Container(
        clock=clock,
        notifier=notifier or SpyNotifier(),
        events=SpyEvents(),
        muse=SpyMuse(),
    )
    container.moves = SqlMoveGateway(engine, clock, container.events, Hooks())
    return HangoutRecorder(engine, container), container


def pairs(session: Session) -> list[tuple[str, str]]:
    session.expire_all()
    rows = session.exec(select(Hangout).where(Hangout.move_id == MOVE)).all()
    return sorted((r.user_a, r.user_b) for r in rows)


async def test_pairs_prompts_event_and_refresh(engine, world):
    recorder, c = make(engine)
    await recorder.on_move_ended(MOVE)

    assert pairs(world) == [("ana", "ben"), ("ana", "cal")]
    row = world.exec(select(Hangout)).first()
    assert (row.weekday, row.hour_bucket, row.category) == (3, "afternoon", "coffee")

    assert sorted(m["user_id"] for m in c.notifier.sent) == ["ana", "ben", "cal", "dee"]
    sent = c.notifier.sent[0]
    assert sent["type"] == "rate_move"
    assert (sent["title"], sent["body"]) == ("How was Kumo?", "Rank it in two taps.")
    assert sent["data"] == {"move_id": MOVE, "route": f"/move/{MOVE}/rate"}

    assert c.events.published == [
        (
            ["ana", "ben", "cal", "dee"],
            "rating.prompt",
            {"move_id": MOVE, "mark_name": "Kumo"},
        )
    ]
    assert c.muse.refreshed == [["ana", "ben", "cal", "dee"]]


async def test_idempotent_on_second_call(engine, world):
    recorder, c = make(engine)
    await recorder.on_move_ended(MOVE)
    await recorder.on_move_ended(MOVE)
    assert pairs(world) == [("ana", "ben"), ("ana", "cal")]
    assert len(c.notifier.sent) == 4
    assert len(c.events.published) == 1


async def test_one_failed_step_does_not_stop_the_others(engine, world):
    recorder, c = make(engine, SpyNotifier(fail_for=frozenset({"ana"})))
    await recorder.on_move_ended(MOVE)
    assert pairs(world) == [("ana", "ben"), ("ana", "cal")]
    assert sorted(m["user_id"] for m in c.notifier.sent) == ["ben", "cal", "dee"]
    assert len(c.events.published) == 1
    assert c.muse.refreshed


async def test_muse_without_refresh_is_fine(engine, world):
    recorder, c = make(engine)
    c.muse = object()  # no refresh_pseudo_groups attribute
    await recorder.on_move_ended(MOVE)
    assert len(c.events.published) == 1


async def test_unknown_move_is_a_no_op(engine, world):
    recorder, c = make(engine)
    await recorder.on_move_ended("nope")
    assert c.notifier.sent == [] and c.events.published == []
