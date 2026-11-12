"""Wires the muse lane into the app. Only the muse lane edits this file.

Registers: Notifier (M4) and MuseGateway (M1+); handlers on on_move_created,
on_move_joined (M4) and on_rating_submitted (M8); flare, revive and nobody-bit
jobs (M7, M9, M10).
"""

from app.container import Container
from app.hooks import Hooks
from app.scheduler.loop import Scheduler


def register(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
    """Nothing registered yet: every port the muse lane owns stays null."""
