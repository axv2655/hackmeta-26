"""Taking back a Pull up, leaving quietly, and which leaves make a ghost (A.2).

* `going` -> leave: the participant row is deleted (no ghost, Pull up again).
* any status -> leave quietly: row deleted, only the leaver is told, no hooks.
* `there` -> leave: `left`, a ghost at the Mark.
* Ghosts need `arrived_at`; someone still `there` when the Move ends ghosts.
"""

import asyncio
from collections.abc import Coroutine
from typing import Any

import pytest
from sqlmodel import Session, select

from app.hooks import Hooks
from app.ports import MoveCreate
from app.repositories.marks import SqlMarkRepository
from app.repositories.unit_of_work import SqlCoreUnitOfWork
from app.services.marks import MarkService
from app.services.moves import MoveService
from app.tables import MoveParticipant
from tests.core.factories import T0, add_circle, add_friends, add_mark, add_users
from tests.core.fakes import FixedClock, RecordingPublisher

LAT, LNG = 32.9857, -96.7502


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro)


@pytest.fixture
def world(session: Session) -> Session:
    """ana posts to Circle "crew" (bo, cy); dee is a friend outside it."""
    add_users(session, ("ana", "bo", "cy", "dee"))
    add_friends(session, "dee", "ana", "bo", "cy")
    add_circle(session, "crew", "ana", "bo", "cy", "dee")
    add_mark(session, "kumo", LAT, LNG)
    session.commit()
    return session


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def events() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def hooks() -> Hooks:
    return Hooks()


@pytest.fixture
def moves(
    world: Session, clock: FixedClock, events: RecordingPublisher, hooks: Hooks
) -> MoveService:
    return MoveService(SqlCoreUnitOfWork(world), clock, events, hooks)


@pytest.fixture
def marks(world: Session, clock: FixedClock) -> MarkService:
    return MarkService(SqlMarkRepository(world), clock)


@pytest.fixture
def move_id(moves: MoveService) -> str:
    draft = MoveCreate(
        mark_id="kumo",
        text="matcha after class",
        category="coffee",
        circle_ids=("crew",),
    )
    return run(moves.create("ana", draft)).id


def rows(world: Session, move_id: str) -> dict[str, str]:
    world.expire_all()
    found = world.exec(
        select(MoveParticipant).where(MoveParticipant.move_id == move_id)
    ).all()
    return {p.user_id: p.status for p in found}


def ghosts(marks: MarkService, viewer: str = "dee") -> list[tuple[str, str]]:
    found = marks.nearby(viewer, LAT, LNG, radius_km=5, limit=10)
    return [(g.user.id, g.text) for item in found for g in item.ghosts]


def test_taking_back_a_pull_up_deletes_the_row_and_allows_pulling_up_again(
    moves: MoveService,
    marks: MarkService,
    world: Session,
    events: RecordingPublisher,
    clock: FixedClock,
    move_id: str,
) -> None:
    run(moves.join("bo", move_id))
    events.published.clear()
    clock.advance(minutes=2)

    move = run(moves.leave("bo", move_id))

    assert move.status == "live"
    assert "bo" not in {p.user_id for p in move.participants}
    assert rows(world, move_id) == {"ana": "going"}
    viewers = frozenset({"ana", "bo", "cy", "dee"})
    removed = {"move_id": move_id, "user_id": "bo", "status": None, "joined_via": "tap"}
    assert events.of_type("participant.changed") == [(viewers, removed)]
    assert ghosts(marks) == []

    again = run(moves.join("bo", move_id))
    assert {p.user_id: p.status for p in again.participants}["bo"] == "going"


def test_quiet_leave_while_there_tells_only_the_leaver_and_leaves_no_ghost(
    moves: MoveService,
    marks: MarkService,
    world: Session,
    events: RecordingPublisher,
    hooks: Hooks,
    move_id: str,
) -> None:
    run(moves.join("bo", move_id))
    run(moves.arrive("bo", move_id))
    events.published.clear()
    fired: list[str] = []
    for hook in (hooks.on_move_joined, hooks.on_move_ended):
        hook.register(lambda *args, name=hook.name: fired.append(name))

    move = run(moves.leave("bo", move_id, quiet=True))

    assert move.status == "live"
    assert rows(world, move_id) == {"ana": "going"}
    assert events.published == [
        (
            frozenset({"bo"}),
            "participant.changed",
            {"move_id": move_id, "user_id": "bo", "status": None, "joined_via": "tap"},
        )
    ]
    assert fired == []
    assert ghosts(marks) == []
    run(moves.end("ana", move_id))
    assert ghosts(marks) == []  # still none after the Move ends


def test_leaving_while_there_keeps_a_ghost_with_the_move_text(
    moves: MoveService, marks: MarkService, world: Session, move_id: str
) -> None:
    run(moves.join("bo", move_id))
    run(moves.arrive("bo", move_id))

    move = run(moves.leave("bo", move_id))

    assert {p.user_id: p.status for p in move.participants}["bo"] == "left"
    assert rows(world, move_id)["bo"] == "left"
    assert ghosts(marks) == [("bo", "matcha after class")]


def test_still_there_when_the_move_ends_ghosts_but_going_only_never_does(
    moves: MoveService, marks: MarkService, move_id: str
) -> None:
    run(moves.join("bo", move_id))
    run(moves.arrive("bo", move_id))
    run(moves.join("cy", move_id))  # pulled up, never arrived

    run(moves.end("ana", move_id))

    assert ghosts(marks) == [("bo", "matcha after class")]


def test_creator_leave_keeps_todays_behaviour(
    moves: MoveService, world: Session, move_id: str
) -> None:
    move = run(moves.leave("ana", move_id))
    assert move.status == "ended"  # the creator was the only participant
    assert rows(world, move_id) == {"ana": "left"}


def test_take_back_ends_the_move_when_everyone_else_left(
    moves: MoveService, move_id: str
) -> None:
    run(moves.join("bo", move_id))
    run(moves.leave("ana", move_id))  # creator becomes `left`
    move = run(moves.leave("bo", move_id))  # bo takes back: row deleted
    assert move.status == "ended"
    assert [(p.user_id, p.status) for p in move.participants] == [("ana", "left")]
