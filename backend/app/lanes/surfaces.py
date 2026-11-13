"""Wires the surfaces lane into the app. Only the surfaces lane edits this file.

Registers: ProximityGateway (S1) and CalendarGateway (S5); handlers on
on_move_created (proximity sweep, S2) and on_move_ended (hangouts and rate
prompts, S8); the sightings purge job (S1).

`register(..., engine=...)` lets tests wire the lane onto an in-memory database.
"""

from sqlalchemy import Engine

from app.container import Container
from app.core import db
from app.hooks import Hooks
from app.scheduler.loop import Scheduler
from app.services.calendar_gateway import SqlCalendarGateway
from app.services.hangouts import HangoutRecorder
from app.services.proximity_sweep import ProximitySweep, SqlProximityGateway, purge

PURGE_INTERVAL_S = 600


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
) -> None:
    eng = engine or db.engine

    # S5: calendar
    container.calendar = SqlCalendarGateway(eng)

    # S1/S2: simulated proximity, the sweep on new Moves, and the purge job
    container.proximity = SqlProximityGateway(eng, container.clock)
    hooks.on_move_created.register(ProximitySweep(eng, container).on_move_created)
    scheduler.register(
        "proximity_purge",
        lambda: purge(eng, container.clock),
        interval_s=PURGE_INTERVAL_S,
    )

    # S8: hangout history, rate prompts and crew refresh when a Move ends
    hooks.on_move_ended.register(HangoutRecorder(eng, container).on_move_ended)
