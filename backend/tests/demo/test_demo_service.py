"""DemoService against the full seeded world: the reset is soft."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.container import Container
from app.core.clock import DemoClock, SystemClock
from app.core.gateways import SqlMoveGateway
from app.hooks import Hooks
from app.seed import ids
from app.seed import seed as seed_runner
from app.services import examples
from app.services.demo import DemoService
from app.tables import CalendarEvent, Move, Suggestion, User
from tests.core.fakes import RecordingPublisher


def demo_service(session: Session, engine: Engine) -> DemoService:
    clock, hooks = DemoClock(), Hooks()
    container = Container(clock=clock, time_control=clock)
    container.moves = SqlMoveGateway(engine, clock, RecordingPublisher(), hooks)
    return DemoService(session, container, hooks)


@pytest.mark.anyio
async def test_end_move_holds_an_example_until_reset(engine: Engine, session: Session):
    seed_runner.run(session, SystemClock())
    demo = demo_service(session, engine)
    try:
        await demo.end_move(ids.MOVE_TONY_KUMO)
        assert examples.held() == frozenset({ids.MOVE_TONY_KUMO})
        examples.ExampleMoves(engine, demo.container.clock).refresh()
        with Session(engine) as s:
            assert s.get(Move, ids.MOVE_TONY_KUMO).status == "ended"
        demo.reset()
        assert examples.held() == frozenset()
        with Session(engine) as s:
            assert s.get(Move, ids.MOVE_TONY_KUMO).status == "live"
    finally:
        examples.release_all()


def test_reset_keeps_accounts_and_expires_cast_suggestions(
    engine: Engine, session: Session
):
    seed_runner.run(session, SystemClock())
    now = datetime.now(UTC)
    session.add(
        User(id="u_real", name="Real Person", first_name="Real", created_at=now)
    )
    session.add(
        Suggestion(
            id="sg_cast",
            user_id=ids.ANISH,
            type="flare",
            created_at=now,
            expires_at=now,
        )
    )
    session.add(
        Suggestion(
            id="sg_real", user_id="u_real", type="flare", created_at=now, expires_at=now
        )
    )
    session.add(
        CalendarEvent(user_id=ids.ANISH, starts_at=now, ends_at=now, location="demo")
    )
    session.add(
        CalendarEvent(user_id=ids.ANISH, starts_at=now, ends_at=now, title="Gym")
    )
    session.commit()
    users_before = len(session.exec(select(User)).all())

    demo = demo_service(session, engine)
    demo.container.time_control.shift(120)
    result = demo.reset()

    assert result.cleared_blocks == 1 and result.expired_suggestions >= 1
    assert demo.offset_minutes() == 0
    with Session(engine) as s:
        assert len(s.exec(select(User)).all()) == users_before
        assert s.get(Suggestion, "sg_cast").status == "expired"
        assert s.get(Suggestion, "sg_real").status == "pending"
        events = s.exec(select(CalendarEvent)).all()
        assert "Gym" in [e.title for e in events]
        assert not [e for e in events if e.location == "demo"]
