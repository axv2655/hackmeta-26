"""Builds the demo world (ARCHITECTURE.md 15.1).

Runs each lane's seed step in a fixed order on one session: core first (people,
places, live Moves), then history (ended Moves and hangouts), then surfaces.
Each step writes only its own lane's tables, using ids from `app.seed.ids`.
"""

from sqlmodel import Session

from app.ports import Clock
from app.seed import core, history, surfaces

STEPS = (core.seed, history.seed, surfaces.seed)


def run(session: Session, clock: Clock) -> None:
    for step in STEPS:
        step(session, clock)
    session.commit()
