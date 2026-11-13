"""Transaction ownership: one commit per mutation, nothing on failure."""
# ruff: noqa: F811, F401

from typing import Any

import pytest
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.domain.privacy import MoveVisibility, can_see
from app.hooks import Hooks
from app.repositories.audience import SqlAudienceRepository
from app.repositories.unit_of_work import SqlCoreUnitOfWork
from app.services.moves import MoveService
from app.tables import Move as MoveRow
from app.tables import MoveAudience, MoveParticipant
from tests.core.fakes import FixedClock, RecordingPublisher
from tests.core.test_move_service import (
    HookLog,
    clock,
    create,
    draft,
    run,
    world,
)


def _rows(engine: Engine) -> tuple[int, int, int]:
    """Move, participant and audience row counts seen by a fresh session."""
    with Session(engine) as fresh:
        return (
            len(fresh.exec(select(MoveRow)).all()),
            len(fresh.exec(select(MoveParticipant)).all()),
            len(fresh.exec(select(MoveAudience)).all()),
        )


@pytest.fixture
def parts(world: Session, clock: FixedClock):  # noqa: F811
    events, hooks = RecordingPublisher(), Hooks()
    log = HookLog(hooks)
    service = MoveService(SqlCoreUnitOfWork(world), clock, events, hooks)
    return service, events, log


def test_failure_at_audience_insertion_leaves_nothing(
    parts: Any, world: Session, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, events, log = parts
    original = SqlAudienceRepository.save

    def fail(self: Any, *args: Any) -> None:
        original(self, *args)
        raise RuntimeError("audience write interrupted")

    monkeypatch.setattr(SqlAudienceRepository, "save", fail)
    with pytest.raises(RuntimeError):
        run(service.create("ana", draft()))

    assert _rows(engine) == (0, 0, 0)
    assert log.calls == [] and events.published == []
    # the service's own session is clean, not stuck on pending rows
    assert world.exec(select(MoveRow)).all() == []


def test_failure_at_participant_insertion_leaves_nothing(
    parts: Any, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, events, log = parts

    def fail(*_: Any) -> None:
        raise RuntimeError("participant write interrupted")

    monkeypatch.setattr(service.uow.moves, "save_participant", fail)
    with pytest.raises(RuntimeError):
        run(service.create("ana", draft()))

    assert _rows(engine) == (0, 0, 0)
    assert log.calls == [] and events.published == []


def test_failed_commit_fires_no_hooks_or_events(
    parts: Any, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, events, log = parts

    def fail() -> None:
        raise RuntimeError("disk full")

    monkeypatch.setattr(service.uow.session, "commit", fail)
    with pytest.raises(RuntimeError):
        run(service.create("ana", draft()))

    assert _rows(engine) == (0, 0, 0)
    assert log.calls == [] and events.published == []


def test_post_commit_subscriber_failure_keeps_the_row(
    world: Session,
    engine: Engine,
    clock: FixedClock,  # noqa: F811
) -> None:
    class Broken:
        async def publish(self, *_: Any) -> None:
            raise RuntimeError("socket gone")

    hooks = Hooks()
    hooks.on_move_created.register(lambda _: (_ for _ in ()).throw(RuntimeError("x")))
    service = MoveService(SqlCoreUnitOfWork(world), clock, Broken(), hooks)

    move_id = create(service)

    assert _rows(engine)[0] == 1
    with Session(engine) as fresh:
        assert fresh.get(MoveRow, move_id) is not None


# viewer, expected: ana creates for crew (bo, cy) and dee joins; mom is blocked.
VISIBILITY = [
    ("ana", True),  # creator
    ("bo", True),  # audience
    ("dee", True),  # participant outside the audience
    ("mom", False),  # blocked by the creator
    ("zed", False),  # stranger
]


@pytest.mark.parametrize(("viewer", "expected"), VISIBILITY)
def test_sql_visibility_matches_pure_can_see(
    world: Session,
    clock: FixedClock,
    viewer: str,
    expected: bool,  # noqa: F811
) -> None:
    service = MoveService(
        SqlCoreUnitOfWork(world), clock, RecordingPublisher(), Hooks()
    )
    move_id = create(service, user_ids=("mom",))
    with Session(world.get_bind()) as s:
        s.add(
            MoveParticipant(
                move_id=move_id,
                user_id="dee",
                status="going",
                joined_via="tap",
                joined_at=clock.now(),
            )
        )
        s.commit()
    world.expire_all()

    move = service.uow.moves.get(move_id)
    assert move is not None
    rule = MoveVisibility(
        creator_id=move.creator_id,
        participant_ids=frozenset(p.user_id for p in move.participants),
        audience_ids=service.uow.moves.audience_ids(move_id),
        hidden_from_ids=service.uow.audience.hidden_from(move.creator_id),
    )
    sql_sees = move_id in {m.id for m in service.list_live_visible(viewer)}

    assert can_see(viewer, rule) is expected
    assert sql_sees is expected
