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
from app.services.notify import MuseNotifier, NotifyService


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
    gateway = lane.gateway

    # M4: Notifier port, notify pipeline, second-order nudges
    container.notifier = MuseNotifier(lane)

    async def notify_move(move_id, force_ids=(), drop_ids=()):
        return await lane.call(
            NotifyService, "notify_move", move_id, force_ids, drop_ids
        )

    async def notify_preview(user_id, **kw):
        return await lane.call(NotifyService, "notify_preview", user_id, **kw)

    async def on_move_created(move_id: str) -> None:
        await lane.call(NotifyService, "on_move_created", move_id)

    async def on_move_joined(move_id: str, user_id: str) -> None:
        await lane.call(NotifyService, "on_move_joined", move_id, user_id)

    gateway.bind("notify_move", notify_move)
    gateway.bind("notify_preview", notify_preview)
    hooks.on_move_created.register(on_move_created)
    hooks.on_move_joined.register(on_move_joined)

    return lane
