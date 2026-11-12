"""MoveService and SqlMoveGateway (core C4): lifecycle, events, hooks, privacy."""

import asyncio
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.domain.errors import (
    EndNotAllowed,
    IllegalTransition,
    MoveNotFound,
    MoveNotLive,
    NotMoveCreator,
)
from app.hooks import Hooks
from app.ports import MoveCreate, MoveGateway
from app.services.moves import MoveService, SqlMoveGateway
from app.tables import (
    Block,
    Circle,
    CircleMember,
    Mark,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    User,
)
from app.tables import Move as MoveRow
from tests.core.fakes import FixedClock, RecordingPublisher

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
USERS = ("ana", "bo", "cy", "dee", "mom", "zed")


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro)


class HookLog:
    """Registers a recorder on every Move hook."""

    def __init__(self, hooks: Hooks) -> None:
        self.calls: list[tuple[str, tuple[str, ...]]] = []
        for hook in (hooks.on_move_created, hooks.on_move_joined, hooks.on_move_ended):
            hook.register(self._recorder(hook.name))

    def _recorder(self, name: str) -> Callable[..., None]:
        def record(*args: str) -> None:
            self.calls.append((name, args))

        return record


@pytest.fixture
def world(session: Session) -> Session:
    """ana owns Circle "crew" (bo, cy); dee is a stranger; ana blocks mom;
    zed is verified for open Moves."""
    session.add_all(
        User(
            id=u,
            name=u.title(),
            first_name=u.title(),
            fb_verified=u in {"zed", "mom"},
            created_at=T0,
        )
        for u in USERS
    )
    session.add(
        Mark(
            id="kumo",
            name="Kumo",
            category="coffee",
            lat=30.28,
            lng=-97.74,
            address="1 Main",
        )
    )
    session.add(Circle(id="crew", owner_id="ana", name="Crew"))
    session.add_all(CircleMember(circle_id="crew", user_id=u) for u in ("bo", "cy"))
    session.add(Block(user_id="ana", hidden_from_user_id="mom"))
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
def log(hooks: Hooks) -> HookLog:
    return HookLog(hooks)


@pytest.fixture
def service(
    world: Session, clock: FixedClock, events: RecordingPublisher, hooks: Hooks
) -> MoveService:
    return MoveService(world, clock, events, hooks)


def draft(**fields: Any) -> MoveCreate:
    fields.setdefault("circle_ids", ("crew",))
    return MoveCreate(mark_id="kumo", text=" matcha? ", category="coffee", **fields)


def create(service: MoveService, **fields: Any) -> str:
    return run(service.create("ana", draft(**fields))).id


# --- create ------------------------------------------------------------------


def test_create_persists_move_creator_and_audience(
    service: MoveService, world: Session, events: RecordingPublisher, log: HookLog
) -> None:
    move = run(service.create("ana", draft(user_ids=("dee", "mom"))))

    assert move.text == "matcha?"
    assert [(p.user_id, p.status) for p in move.participants] == [("ana", "going")]
    world.expire_all()
    assert world.get(MoveRow, move.id) is not None
    assert world.exec(select(MoveParticipant.user_id)).all() == ["ana"]
    audience = world.exec(select(MoveAudience.user_id, MoveAudience.via)).all()
    assert sorted(audience) == [
        ("bo", "circle:crew"),
        ("cy", "circle:crew"),
        ("dee", "direct"),
    ]
    assert world.exec(select(MoveAudienceCircle.circle_id)).all() == ["crew"]

    assert log.calls == [("on_move_created", (move.id,))]
    assert events.published == [
        (
            frozenset({"ana", "bo", "cy", "dee"}),
            "move.created",
            {
                "move_id": move.id,
                "creator_id": "ana",
                "mark_id": "kumo",
                "category": "coffee",
                "kind": "move",
            },
        )
    ]


def test_create_with_creator_there(service: MoveService) -> None:
    move = run(service.create("ana", draft(creator_there=True)))
    assert move.participants[0].status == "there"
    assert move.participants[0].arrived_at == T0


def test_hooks_run_after_commit(
    engine: Engine, service: MoveService, hooks: Hooks
) -> None:
    seen: list[bool] = []

    def check(move_id: str) -> None:
        with Session(engine) as other:
            seen.append(other.get(MoveRow, move_id) is not None)

    hooks.on_move_created.register(check)
    create(service)
    assert seen == [True]


def test_failing_hook_and_publisher_do_not_break_the_service(
    world: Session, clock: FixedClock, hooks: Hooks, log: HookLog
) -> None:
    class BrokenPublisher:
        async def publish(self, *_: Any) -> None:
            raise RuntimeError("socket gone")

    def boom(_: str) -> None:
        raise RuntimeError("boom")

    hooks.on_move_created.register(boom)
    hooks.on_move_created.register(log._recorder("after"))
    move = run(
        MoveService(world, clock, BrokenPublisher(), hooks).create("ana", draft())
    )

    assert [name for name, _ in log.calls] == ["on_move_created", "after"]
    assert world.get(MoveRow, move.id) is not None


def test_works_without_hook_handlers(world: Session, clock: FixedClock) -> None:
    service = MoveService(world, clock, RecordingPublisher(), Hooks())
    move_id = create(service)
    run(service.join("bo", move_id))
    run(service.end("ana", move_id))


# --- join / arrive / leave ---------------------------------------------------


def test_hidden_move_join_is_not_found(service: MoveService) -> None:
    move_id = create(service, user_ids=("mom",))
    for outsider in ("dee", "mom"):  # not in audience / blocked
        with pytest.raises(MoveNotFound):
            run(service.join(outsider, move_id))
        with pytest.raises(MoveNotFound):
            service.get(outsider, move_id)
    with pytest.raises(MoveNotFound):
        run(service.join("bo", "nope"))


def test_join_arrive_leave(
    service: MoveService, events: RecordingPublisher, log: HookLog, clock: FixedClock
) -> None:
    move_id = create(service)
    events.published.clear()

    clock.advance(minutes=5)
    move = run(service.join("bo", move_id))
    assert move.participants[-1].status == "going"
    run(service.join("bo", move_id))  # idempotent: no event, no hook
    clock.advance(minutes=5)
    move = run(service.arrive("bo", move_id))
    assert move.participants[-1].arrived_at == clock.now()
    run(service.arrive("bo", move_id))
    move = run(service.leave("bo", move_id))
    assert move.status == "live"

    viewers = frozenset({"ana", "bo", "cy"})
    assert events.of_type("participant.changed") == [
        (
            viewers,
            {"move_id": move_id, "user_id": "bo", "status": s, "joined_via": "tap"},
        )
        for s in ("going", "there", "left")
    ]
    assert log.calls[1:] == [("on_move_joined", (move_id, "bo"))]

    with pytest.raises(IllegalTransition):  # rejoin after leaving
        run(service.join("bo", move_id))


def test_everyone_left_ends_the_move(
    service: MoveService, events: RecordingPublisher, log: HookLog, clock: FixedClock
) -> None:
    move_id = create(service)
    run(service.join("bo", move_id))
    run(service.leave("ana", move_id))
    clock.advance(minutes=1)
    move = run(service.leave("bo", move_id))

    assert (move.status, move.ends_at) == ("ended", clock.now())
    assert events.published[-1] == (
        frozenset({"ana", "bo", "cy"}),
        "move.ended",
        {
            "move_id": move_id,
            "status": "ended",
            "reason": "everyone_left",
            "ends_at": clock.now().isoformat(),
        },
    )
    assert log.calls[-1] == ("on_move_ended", (move_id,))
    assert service.get("ana", move_id).status == "ended"


def test_open_ble_join_widens_audience(service: MoveService, log: HookLog) -> None:
    move_id = create(service, open=True)
    move = run(service.join("zed", move_id, "there", "open_ble"))
    assert move.participants[-1].status == "there"
    assert "zed" in service.audience_ids(move_id)
    assert log.calls[-1] == ("on_move_joined", (move_id, "zed"))

    for barred in ("dee", "mom"):  # unverified / blocked
        with pytest.raises(MoveNotFound):
            run(service.join(barred, move_id, "there", "open_ble"))
    closed = create(service)
    with pytest.raises(MoveNotFound):
        run(service.join("zed", closed, "there", "open_ble"))


# --- end -----------------------------------------------------------------------


def test_only_creator_ends(
    service: MoveService, events: RecordingPublisher, log: HookLog
) -> None:
    move_id = create(service)
    with pytest.raises(NotMoveCreator):
        run(service.end("bo", move_id))
    with pytest.raises(MoveNotFound):
        run(service.end("dee", move_id))

    move = run(service.end("ana", move_id))
    assert move.status == "ended"
    assert events.of_type("move.ended")[0][1]["reason"] == "creator"
    assert log.calls.count(("on_move_ended", (move_id,))) == 1
    with pytest.raises(MoveNotLive):
        run(service.end("ana", move_id))
    with pytest.raises(MoveNotLive):
        run(service.join("bo", move_id))


def test_end_stale(service: MoveService, clock: FixedClock, log: HookLog) -> None:
    idle, busy = create(service), create(service)
    clock.advance(hours=2)
    run(service.join("bo", busy))
    clock.advance(minutes=59)
    assert run(service.end_stale()) == []

    clock.advance(minutes=1)  # idle is exactly 3h old
    assert run(service.end_stale()) == [idle]
    assert service.get("ana", idle).status == "ended"
    assert service.get("ana", busy).status == "live"
    assert log.calls[-1] == ("on_move_ended", (idle,))
    assert run(service.end_stale()) == []


# --- gateway -------------------------------------------------------------------


@pytest.fixture
def gateway(
    engine: Engine,
    world: Session,
    clock: FixedClock,
    events: RecordingPublisher,
    hooks: Hooks,
) -> SqlMoveGateway:
    return SqlMoveGateway(engine, clock, events, hooks)


def test_gateway_satisfies_port(gateway: SqlMoveGateway) -> None:
    assert isinstance(gateway, MoveGateway)


def test_gateway_round_trip(
    gateway: SqlMoveGateway, clock: FixedClock, log: HookLog
) -> None:
    move = run(gateway.create("ana", draft()))
    assert gateway.get(move.id) == move
    assert gateway.audience_ids(move.id) == {"bo", "cy"}
    assert [m.id for m in gateway.list_live_visible("bo")] == [move.id]
    assert gateway.list_live_visible("dee") == []

    run(gateway.add_participant(move.id, "bo", "there", "ble_auto"))
    run(gateway.add_participant(move.id, "bo", "there", "ble_prompt"))  # no-op
    snapshot = gateway.get(move.id)
    assert snapshot is not None
    assert [(p.user_id, p.status) for p in snapshot.participants][-1] == ("bo", "there")
    with pytest.raises(MoveNotFound):  # BLE never widens a closed audience
        run(gateway.add_participant(move.id, "dee", "there", "ble_auto"))

    with pytest.raises(EndNotAllowed):
        run(gateway.end(move.id, "nobody_bit"))
    clock.advance(hours=3)
    assert run(gateway.end_stale()) == [move.id]
    assert [name for name, _ in log.calls] == [
        "on_move_created",
        "on_move_joined",
        "on_move_ended",
    ]


def test_gateway_does_not_re_add_a_leaver(
    gateway: SqlMoveGateway, service: MoveService, log: HookLog
) -> None:
    move_id = create(service)
    run(service.join("bo", move_id))
    run(service.leave("bo", move_id))

    run(gateway.add_participant(move_id, "bo", "there", "ble_auto"))
    snapshot = gateway.get(move_id)
    assert snapshot is not None
    assert {p.user_id: p.status for p in snapshot.participants}["bo"] == "left"


def test_gateway_ends_for_reason(gateway: SqlMoveGateway, log: HookLog) -> None:
    move = run(gateway.create("ana", draft()))
    run(gateway.end(move.id, "nobody_bit"))
    snapshot = gateway.get(move.id)
    assert snapshot is not None
    assert snapshot.status == "cancelled"
    assert log.calls[-1] == ("on_move_ended", (move.id,))
