"""Example Moves stay fresh and reach every account."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine
from sqlmodel import Session

from app.core.clock import SystemClock
from app.seed import ids
from app.seed import seed as seed_runner
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
