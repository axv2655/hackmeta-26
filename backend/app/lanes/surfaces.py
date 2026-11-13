"""Wires the surfaces lane into the app. Only the surfaces lane edits this file.

Registers: ProximityGateway (S1) and CalendarGateway (S5); handlers on
on_move_created (proximity sweep, S2) and on_move_ended (hangouts and rate
prompts, S8); the sightings purge job (S1).

`register(..., engine=...)` lets tests wire the lane onto an in-memory database.
"""

import os

from sqlalchemy import Engine

from app.container import Container
from app.core import db
from app.core.config import settings
from app.hooks import Hooks
from app.repositories.glasses_places import (
    DEFAULT_DEMO_MARK_ID,
    SqlPlaceCreator,
    SqlPlaceFinder,
)
from app.scheduler.loop import Scheduler
from app.services import glasses
from app.services.calendar_gateway import SqlCalendarGateway
from app.services.hangouts import HangoutRecorder
from app.services.proximity_sweep import ProximitySweep, SqlProximityGateway, purge

PURGE_INTERVAL_S = 600
DEMO_MARK_ENV = "GLASSES_DEMO_MARK_ID"


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

    # S9: pending glasses drafts (in memory, 5 min TTL on the Clock; expired ones
    # are swept whenever a new draft is stored) and the place fallbacks (named
    # spot, usual spot, the demo Mark in DEMO_MODE).
    places = SqlPlaceFinder(eng, os.environ.get(DEMO_MARK_ENV) or DEFAULT_DEMO_MARK_ID)
    glasses.install(
        glasses.DraftStore(lambda: container.clock.now()),
        places,
        demo_mode=lambda: settings.DEMO_MODE is not None,
        creator=SqlPlaceCreator(eng, lambda: container.clock),
    )
