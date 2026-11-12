"""Wires the muse lane into the app. Only the muse lane edits this file.

Registers: Notifier (M4) and MuseGateway (M1+); handlers on on_move_created,
on_move_joined (M4) and on_rating_submitted (M8); flare, revive and nobody-bit
jobs (M7, M9, M10).

`register(..., engine=..., client=...)` lets tests wire the lane onto an
in-memory database with a `FakeMuseClient`.
"""

from sqlalchemy import Engine

from app.container import Container
from app.core import db
from app.hooks import Hooks
from app.muse.client import MuseClient, client_from_settings
from app.muse.lane import MuseLane
from app.scheduler.loop import Scheduler


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
    client: MuseClient | None = None,
) -> MuseLane:
    # M1: runner, client and the MuseGateway port
    lane = MuseLane.build(
        engine or db.engine, container, client or client_from_settings()
    )
    container.muse = lane.gateway
    gateway = lane.gateway  # noqa: F841  (later tasks bind onto it)

    return lane
