"""Wires the core lane into the app. Only the core lane edits this file.

Registers: Clock and TimeControl (C1), EventPublisher (C9), MoveGateway (C4),
MarkGateway (C6) and UserGateway (C7); the stale-Move job (C4).
"""

from app.container import Container
from app.core import db
from app.core.clock import DemoClock, SystemClock
from app.core.config import settings
from app.hooks import Hooks
from app.realtime import ConnectionHub
from app.scheduler.loop import Scheduler
from app.services.moves import SqlMoveGateway
from app.services.users import SqlUserGateway


def register(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
    db.create_all(db.engine)
    if settings.DEMO_MODE:
        clock = DemoClock()
        container.clock = clock
        container.time_control = clock
    else:
        container.clock = SystemClock()

    # C9: realtime hub
    container.events = ConnectionHub(container.clock)

    # C7: users
    container.users = SqlUserGateway(db.engine, container.clock)

    # C4: moves, and the stale-Move job (ARCHITECTURE.md 7.3)
    moves = SqlMoveGateway(db.engine, container.clock, container.events, hooks)
    container.moves = moves
    scheduler.register("end_stale_moves", moves.end_stale, interval_s=60)
