"""Per-lane wiring. Each lane edits only its own module here.

`app/main.py` calls every lane's `register(container, hooks, scheduler)` once
at startup, in the order core, muse, surfaces.
"""

from collections.abc import Callable

from app.container import Container
from app.hooks import Hooks
from app.scheduler.loop import Scheduler

type Registrar = Callable[[Container, Hooks, Scheduler], None]
