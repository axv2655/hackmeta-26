"""Wires the surfaces lane into the app. Only the surfaces lane edits this file.

Registers: ProximityGateway (S1) and CalendarGateway (S5); handlers on
on_move_created (S2) and on_move_ended (S8); the sightings purge job (S1).
"""

import os

from app.container import Container
from app.core import db
from app.core.config import settings
from app.hooks import Hooks
from app.repositories.glasses_places import DEFAULT_DEMO_MARK_ID, SqlPlaceFinder
from app.scheduler.loop import Scheduler
from app.services import glasses

DEMO_MARK_ENV = "GLASSES_DEMO_MARK_ID"


def register(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
    """S9: pending glasses drafts (in memory, 5 min TTL on the Clock), the place
    fallbacks (named spot, usual spot, the demo Mark in DEMO_MODE) and the job
    that sweeps expired drafts. Every other surfaces port stays null for now."""
    places = SqlPlaceFinder(
        db.engine, os.environ.get(DEMO_MARK_ENV) or DEFAULT_DEMO_MARK_ID
    )
    drafts = glasses.install(
        glasses.DraftStore(lambda: container.clock.now()),
        places,
        demo_mode=lambda: settings.DEMO_MODE is not None,
    )
    scheduler.register("glasses_purge_drafts", drafts.purge, interval_s=60)
