"""Builds the demo world (ARCHITECTURE.md 15.1).

Runs each lane's seed step in a fixed order on one session: core first (people,
places, live Moves), then history (ended Moves and hangouts), then surfaces,
then muse (pseudo-groups and taste over that history).
Each step writes only its own lane's tables, using ids from `app.seed.ids`.

`uv run python -m app.seed.seed` drops and rebuilds the database.
"""

from sqlmodel import Session

from app.core import db
from app.core.clock import SystemClock
from app.ports import Clock
from app.seed import core, history, muse, surfaces

STEPS = (core.seed, history.seed, surfaces.seed, muse.seed)


def run(session: Session, clock: Clock) -> None:
    for step in STEPS:
        step(session, clock)
    session.commit()


def main() -> None:
    db.reset(db.engine)
    with Session(db.engine) as session:
        run(session, SystemClock())


if __name__ == "__main__":
    main()
