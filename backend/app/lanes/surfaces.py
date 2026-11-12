"""Wires the surfaces lane into the app. Only the surfaces lane edits this file.

Registers: ProximityGateway (S1) and CalendarGateway (S5); handlers on
on_move_created (S2) and on_move_ended (S8); the sightings purge job (S1).
"""

from app.container import Container
from app.hooks import Hooks
from app.scheduler.loop import Scheduler


def register(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
    """Nothing registered yet: every port the surfaces lane owns stays null."""
