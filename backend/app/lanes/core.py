"""Wires the core lane into the app. Only the core lane edits this file.

Registers: Clock and TimeControl (C1), EventPublisher (C9), MoveGateway (C4),
MarkGateway (C6) and UserGateway (C7); the stale-Move job (C4).
"""

from app.container import Container
from app.hooks import Hooks
from app.scheduler.loop import Scheduler


def register(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
    """Nothing registered yet: every port the core lane owns stays null."""
