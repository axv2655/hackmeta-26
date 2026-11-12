import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import Engine, inspect
from sqlmodel import Session, select

from app.container import Container
from app.core import clock as clock_module
from app.core import db
from app.core.clock import DemoClock, SystemClock
from app.core.config import settings
from app.hooks import Hooks
from app.lanes import core as core_lane
from app.scheduler.loop import Scheduler
from app.tables import User, metadata

APP_DIR = Path(__file__).resolve().parents[2] / "app"
T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


class SteppingClock:
    """Base clock the test advances by hand."""

    def __init__(self, at: datetime) -> None:
        self.at = at

    def now(self) -> datetime:
        return self.at


class TestDemoClock:
    def test_defaults_to_base_time(self) -> None:
        assert DemoClock(SteppingClock(T0)).now() == T0

    def test_set_time_offset_persists_as_base_time_moves(self) -> None:
        base = SteppingClock(T0)
        clock = DemoClock(base)
        clock.set_time("2026-11-12T20:10:00+00:00")
        assert clock.now() == datetime(2026, 11, 12, 20, 10, tzinfo=UTC)
        base.at += timedelta(minutes=5)
        assert clock.now() == datetime(2026, 11, 12, 20, 15, tzinfo=UTC)
        assert clock.offset == timedelta(hours=6, minutes=10)

    def test_set_time_converts_zones_and_treats_naive_as_utc(self) -> None:
        clock = DemoClock(SteppingClock(T0))
        clock.set_time("2026-11-12T09:00:00-06:00")
        assert clock.now() == datetime(2026, 11, 12, 15, 0, tzinfo=UTC)
        clock.set_time("2026-11-12T09:00:00")
        assert clock.now() == datetime(2026, 11, 12, 9, 0, tzinfo=UTC)

    def test_shift_accumulates_and_reset_clears(self) -> None:
        clock = DemoClock(SteppingClock(T0))
        clock.shift(30)
        clock.shift(-10)
        assert clock.now() == T0 + timedelta(minutes=20)
        clock.reset()
        assert clock.now() == T0


def test_system_clock_is_aware_utc() -> None:
    assert SystemClock().now().tzinfo is UTC


@pytest.mark.parametrize("demo_mode", [None, "on"])
def test_core_lane_registers_clock(
    monkeypatch: pytest.MonkeyPatch, demo_mode: str | None
) -> None:
    monkeypatch.setattr(settings, "DEMO_MODE", demo_mode)
    monkeypatch.setattr(db, "engine", db.make_engine(db.MEMORY))
    container = Container()
    core_lane.register(container, Hooks(), Scheduler())
    if demo_mode:
        assert isinstance(container.clock, DemoClock)
        assert container.time_control is container.clock
    else:
        assert isinstance(container.clock, SystemClock)
    assert set(inspect(db.engine).get_table_names()) == set(metadata.tables)


def test_reset_recreates_empty_tables() -> None:
    engine = db.make_engine(db.MEMORY)
    db.create_all(engine)
    with Session(engine) as session:
        session.add(User(name="Anish A", first_name="Anish", created_at=T0))
        session.commit()

    db.reset(engine)

    assert set(inspect(engine).get_table_names()) == set(metadata.tables)
    with Session(engine) as session:
        assert session.exec(select(User)).all() == []


@pytest.mark.parametrize("helper", [db.create_all, db.reset])
def test_file_database_folder_is_created(
    tmp_path: Path, helper: Callable[[Engine], None]
) -> None:
    path = tmp_path / "nested" / "app.db"
    helper(db.make_engine(str(path)))
    assert path.exists()


WALL_CLOCK = re.compile(r"\bdatetime\.(?:now|utcnow)\(|\butcnow\(")


def test_only_the_clock_reads_the_wall_clock() -> None:
    allowed = Path(clock_module.__file__).resolve()
    offenders = [
        f"{path.relative_to(APP_DIR)}:{number}"
        for path in sorted(APP_DIR.rglob("*.py"))
        if path.resolve() != allowed
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if WALL_CLOCK.search(line)
    ]
    assert offenders == []
