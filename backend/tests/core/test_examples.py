"""Example Moves stay fresh and reach every account."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine
from sqlmodel import Session

from app.core.clock import SystemClock
from app.seed import ids
from app.seed import seed as seed_runner
from app.services import examples
from app.services.examples import ExampleMoves
from app.tables import Move, MoveAudience, User


class Later:
    def __init__(self, now: datetime) -> None:
        self.current = now

    def now(self) -> datetime:
        return self.current


def test_examples_are_retimed_revived_and_shared(engine: Engine, session: Session):
    seed_runner.run(session, SystemClock())
    session.add(
        User(
            id="u_new",
            name="New Person",
            first_name="New",
            created_at=datetime.now(UTC),
        )
    )
    tony = session.get(Move, ids.MOVE_TONY_KUMO)
    tony.status, tony.ends_at = "ended", datetime.now(UTC)  # the stale job got it
    session.commit()

    later = Later(datetime.now(UTC) + timedelta(hours=6))
    ExampleMoves(engine, later).refresh()

    with Session(engine) as s:
        tony = s.get(Move, ids.MOVE_TONY_KUMO)
        assert tony.status == "live" and tony.ends_at is None
        age = later.now() - tony.starts_at.replace(tzinfo=UTC)
        assert age < timedelta(hours=1)  # reads as fresh again
        assert s.get(MoveAudience, (ids.MOVE_TONY_KUMO, "u_new")) is not None
        last_night = s.get(Move, ids.MOVE_LAST_NIGHT)
        assert last_night.status != "live"  # an ended example stays ended


def _seeded_with_new_user(session: Session) -> None:
    seed_runner.run(session, SystemClock())
    session.add(
        User(
            id="u_new",
            name="New Person",
            first_name="New",
            created_at=datetime.now(UTC),
        )
    )
    session.commit()


def _end(session: Session, move_id: str) -> None:
    move = session.get(Move, move_id)
    move.status, move.ends_at = "ended", datetime.now(UTC)
    session.add(move)
    session.commit()


def test_held_examples_stay_ended(engine: Engine, session: Session):
    _seeded_with_new_user(session)
    _end(session, ids.MOVE_TONY_KUMO)
    _end(session, ids.MOVE_JORDAN_PICKLEBALL)
    examples.hold(ids.MOVE_TONY_KUMO)
    try:
        later = Later(datetime.now(UTC) + timedelta(hours=6))
        ExampleMoves(engine, later).refresh()
        with Session(engine) as s:
            assert s.get(Move, ids.MOVE_TONY_KUMO).status == "ended"  # held
            assert s.get(Move, ids.MOVE_JORDAN_PICKLEBALL).status == "live"
        examples.release_all()
        ExampleMoves(engine, later).refresh()
        with Session(engine) as s:
            assert s.get(Move, ids.MOVE_TONY_KUMO).status == "live"
    finally:
        examples.release_all()


def test_new_accounts_see_last_nights_example(engine: Engine, session: Session):
    _seeded_with_new_user(session)
    ExampleMoves(engine, SystemClock()).refresh()
    with Session(engine) as s:
        assert s.get(MoveAudience, (ids.MOVE_LAST_NIGHT, "u_new")) is not None
