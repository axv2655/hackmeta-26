import asyncio

import pytest

from app.scheduler.loop import Scheduler


def test_jobs_repeat_and_survive_failures() -> None:
    runs = {"sync": 0, "async": 0, "broken": 0}

    def tick() -> None:
        runs["sync"] += 1

    async def atick() -> None:
        runs["async"] += 1

    def broken() -> None:
        runs["broken"] += 1
        raise RuntimeError("boom")

    async def scenario() -> None:
        scheduler = Scheduler()
        scheduler.register("sync", tick, interval_s=0.01)
        scheduler.register("async", atick, interval_s=0.01)
        scheduler.register("broken", broken, interval_s=0.01)
        scheduler.start()
        await asyncio.sleep(0.1)
        await scheduler.stop()

    asyncio.run(scenario())
    assert all(count >= 2 for count in runs.values()), runs


def test_duplicate_or_invalid_registration_is_rejected() -> None:
    scheduler = Scheduler()
    scheduler.register("job", lambda: None, interval_s=1)
    with pytest.raises(ValueError):
        scheduler.register("job", lambda: None, interval_s=1)
    with pytest.raises(ValueError):
        scheduler.register("other", lambda: None, interval_s=0)
