"""A 5-second per-user cache for the hot read endpoints (feed, nearby Moves,
nearby Marks).

Keyed by app, user, path and query string, so one user never sees another's
answer (visibility and Muse ranking are per viewer). Any write request to a
router that carries `invalidate_on_write` empties it, so a Move you just posted
or joined shows on the next read. Time comes from the container's `Clock`.
Responses hold no user coordinates, so nothing sensitive is kept here.
"""

import threading
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request

TTL = timedelta(seconds=5)
MAX_ENTRIES = 512

_lock = threading.Lock()
_entries: dict[tuple[int, str, str, str], tuple[datetime, Any]] = {}


def clear() -> None:
    with _lock:
        _entries.clear()


def invalidate_on_write(request: Request) -> None:
    """Router dependency: a non-GET request drops every cached read."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        clear()


async def cached(
    request: Request,
    user_id: str,
    now: Callable[[], datetime],
    compute: Callable[[], Awaitable[Any]],
) -> Any:
    key = (id(request.app), user_id, request.url.path, request.url.query)
    moment = now()
    with _lock:
        hit = _entries.get(key)
    if hit is not None and hit[0] > moment:
        return hit[1]
    value = await compute()
    with _lock:
        if len(_entries) >= MAX_ENTRIES:
            _entries.clear()
        _entries[key] = (moment + TTL, value)
    return value
