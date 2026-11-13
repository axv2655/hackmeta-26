"""Where each person is, as their phone last reported it.

The app sends `X-Timezone` (IANA name) and `X-UTC-Offset` (minutes east of UTC)
on every request. `TimezoneMiddleware` remembers the zone for that user and
makes it the local zone for the request, so every "free til 2:50" the server
writes matches the clock on the phone that reads it. Background scans have no
request, so they wrap their per-user work in `as_user`.

Memory only: a restart forgets, and the next request from each phone restores
it. Until then `domain.affinity.DEFAULT_TZ` applies. Nothing here is a
location: a zone name is far coarser than the "near" query (1.5 rule 2).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

from starlette.types import ASGIApp, Receive, Scope, Send

from app.domain import affinity

ZONE_HEADER = b"x-timezone"
OFFSET_HEADER = b"x-utc-offset"
USER_HEADER = b"x-user-id"
MAX_OFFSET_MIN = 14 * 60

_zones: dict[str, tzinfo] = {}


def parse_zone(name: str | None, offset_minutes: str | None) -> tzinfo | None:
    """The IANA zone when this machine knows it, else the fixed offset, else None."""
    if name:
        try:
            return ZoneInfo(name.strip())
        except (KeyError, ValueError, OSError):
            pass  # unknown name or no tz database: fall through to the offset
    try:
        minutes = int(offset_minutes) if offset_minutes is not None else None
    except ValueError:
        return None
    if minutes is None or abs(minutes) > MAX_OFFSET_MIN:
        return None
    return timezone(timedelta(minutes=minutes))


def remember(user_id: str, zone: tzinfo) -> None:
    _zones[user_id] = zone


def zone_for(user_id: str | None) -> tzinfo | None:
    return _zones.get(user_id) if user_id else None


def forget_all() -> None:
    """For tests."""
    _zones.clear()


@contextmanager
def as_user(user_id: str) -> Iterator[None]:
    """Local time means `user_id`'s zone inside this block (background scans)."""
    token = affinity.use_zone(zone_for(user_id) or affinity.current_zone())
    try:
        yield
    finally:
        affinity.reset_zone(token)


class TimezoneMiddleware:
    """Pure ASGI, so the zone it sets is visible to the endpoint and its threads."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k: v.decode("latin-1") for k, v in scope.get("headers", [])}
        user_id = headers.get(USER_HEADER)
        zone = parse_zone(headers.get(ZONE_HEADER), headers.get(OFFSET_HEADER))
        if zone is not None and user_id:
            remember(user_id, zone)
        token = affinity.use_zone(zone or zone_for(user_id))
        try:
            await self.app(scope, receive, send)
        finally:
            affinity.reset_zone(token)
