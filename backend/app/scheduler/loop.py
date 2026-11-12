"""Generic periodic-job loop (move expiry, flare scan, revive scan, purges).

Lanes register their own jobs from `app/lanes/<lane>.py`:

    scheduler.register("end_stale_moves", moves.end_stale, interval_s=60)

Each job runs in its own asyncio task, first after one interval, then every
interval. A failing run is logged and the job keeps its schedule. Nobody edits
this file to add a job.
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

type JobFn = Callable[[], Awaitable[object] | object]


@dataclass(frozen=True, slots=True)
class Job:
    name: str
    fn: JobFn
    interval_s: float


class Scheduler:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._tasks: list[asyncio.Task[None]] = []

    @property
    def jobs(self) -> tuple[Job, ...]:
        return tuple(self._jobs.values())

    def register(self, name: str, fn: JobFn, interval_s: float) -> None:
        if name in self._jobs:
            raise ValueError(f"scheduler job {name!r} is already registered")
        if interval_s <= 0:
            raise ValueError("interval_s must be positive")
        self._jobs[name] = Job(name, fn, interval_s)

    def start(self) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(self._loop(job), name=f"job:{job.name}")
            for job in self._jobs.values()
        ]

    async def stop(self) -> None:
        tasks, self._tasks = self._tasks, []
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def _loop(self, job: Job) -> None:
        while True:
            await asyncio.sleep(job.interval_s)
            try:
                result = job.fn()
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception("scheduler job %s failed", job.name)
