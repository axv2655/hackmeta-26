"""Keeps the seeded example Moves fresh and visible to everyone
(`app/services/examples.py`): right after boot, then every five minutes."""

import logging
import threading

from sqlalchemy import Engine

from app.container import Container
from app.core import db
from app.hooks import Hooks
from app.scheduler.loop import Scheduler
from app.services.examples import ExampleMoves

log = logging.getLogger(__name__)


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
) -> None:
    examples = ExampleMoves(engine or db.engine, container.clock)

    def first_refresh() -> None:
        try:
            examples.refresh()
        except Exception:  # an empty or unseeded database is fine
            log.warning("example Moves not refreshed at boot", exc_info=True)

    # Off the startup path: against a remote database it takes a few seconds.
    threading.Thread(target=first_refresh, name="example-moves", daemon=True).start()
    scheduler.register("example_moves", examples.refresh, interval_s=300)
