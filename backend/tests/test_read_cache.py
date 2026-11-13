"""The 5-second per-user read cache: hits, expiry, per-user keys, write flush."""

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.api import read_cache

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def request(path: str = "/moves/feed", query: str = "", method: str = "GET"):
    app = SimpleNamespace()
    url = SimpleNamespace(path=path, query=query)
    return SimpleNamespace(app=app, url=url, method=method)


def run_cached(req, user: str, now: datetime, counter: list[int]):
    async def compute():
        counter.append(1)
        return len(counter)

    return asyncio.run(read_cache.cached(req, user, lambda: now, compute))


def setup_function() -> None:
    read_cache.clear()


def test_second_read_within_5s_is_a_hit() -> None:
    calls: list[int] = []
    req = request()
    assert run_cached(req, "ana", T0, calls) == 1
    assert run_cached(req, "ana", T0 + timedelta(seconds=4), calls) == 1
    assert len(calls) == 1


def test_expires_after_5s() -> None:
    calls: list[int] = []
    req = request()
    run_cached(req, "ana", T0, calls)
    assert run_cached(req, "ana", T0 + timedelta(seconds=5), calls) == 2


def test_keys_are_per_user_and_per_query() -> None:
    calls: list[int] = []
    req = request(query="lat=1")
    run_cached(req, "ana", T0, calls)
    run_cached(req, "bo", T0, calls)
    other = SimpleNamespace(
        app=req.app, url=SimpleNamespace(path="/moves/feed", query="lat=2")
    )
    run_cached(other, "ana", T0, calls)
    assert len(calls) == 3


def test_a_write_flushes_the_cache() -> None:
    calls: list[int] = []
    req = request()
    run_cached(req, "ana", T0, calls)
    read_cache.invalidate_on_write(request(method="GET"))
    run_cached(req, "ana", T0, calls)
    assert len(calls) == 1
    read_cache.invalidate_on_write(request(method="POST"))
    run_cached(req, "ana", T0, calls)
    assert len(calls) == 2
