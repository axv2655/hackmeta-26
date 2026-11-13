"""The surfaces lane wires its ports, hooks and jobs."""

from datetime import UTC, datetime

from sqlalchemy import Engine

from app.container import Container
from app.hooks import Hooks
from app.lanes import surfaces
from app.scheduler.loop import Scheduler
from app.services.calendar_gateway import SqlCalendarGateway
from app.services.proximity_sweep import SqlProximityGateway


class FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


def test_register_wires_the_lane(engine: Engine) -> None:
    container, hooks, scheduler = Container(clock=FixedClock()), Hooks(), Scheduler()
    surfaces.register(container, hooks, scheduler, engine=engine)

    assert isinstance(container.calendar, SqlCalendarGateway)
    assert isinstance(container.proximity, SqlProximityGateway)
    assert len(hooks.on_move_ended.handlers) == 1
    assert len(hooks.on_move_created.handlers) == 1
    assert [j.name for j in scheduler.jobs] == ["proximity_purge"]


def test_purge_job_runs_on_the_lane_engine(engine: Engine) -> None:
    container, scheduler = Container(clock=FixedClock()), Scheduler()
    surfaces.register(container, Hooks(), scheduler, engine=engine)
    assert scheduler.jobs[0].fn() == 0
