"""Wires APNs into the `push` port when a key is configured (APNS_* settings).
Without one the port stays null and notifications are in-app only."""

import logging
from pathlib import Path

from sqlalchemy import Engine

from app.container import Container
from app.core import db
from app.core.config import settings
from app.hooks import Hooks
from app.push.apns import ApnsClient
from app.scheduler.loop import Scheduler
from app.services.push import ApnsPushSender

log = logging.getLogger(__name__)


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
) -> None:
    s = settings
    if not (s.APNS_KEY_PATH and s.APNS_KEY_ID and s.APNS_TEAM_ID and s.APNS_TOPIC):
        return
    try:
        key = Path(s.APNS_KEY_PATH).read_text()
    except OSError:
        log.warning("APNS_KEY_PATH is set but unreadable; pushes are off")
        return
    client = ApnsClient(key, s.APNS_KEY_ID, s.APNS_TEAM_ID, s.APNS_TOPIC)
    container.push = ApnsPushSender(engine or db.engine, client)
