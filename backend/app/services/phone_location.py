"""The phone's last coarse location, held in memory for the MCP place lookup.

Muse runs in Meta's cloud, so it cannot know where the user is. The Moves app
pings its own coarse point (`POST /glasses/location`) while it is open, and the
MCP tools use the latest fresh one to pick the nearest seeded Mark.

Privacy (ARCHITECTURE.md 1.5): the point is rounded to ~100 m, kept only in this
process (never written to the DB, never logged, never echoed), per user, for
`TTL`. It is recorded and read only while the user's location sharing is on, and
a restart forgets it.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

from app.container import Container

TTL = timedelta(minutes=30)
DECIMALS = 3  # ~100 m, the same rounding the app sends


class PhoneLocation:
    def __init__(
        self,
        now: Callable[[], datetime],
        opted_in: Callable[[str], bool],
        ttl: timedelta = TTL,
    ) -> None:
        self._now = now
        self._opted_in = opted_in
        self._ttl = ttl
        self._points: dict[str, tuple[float, float, datetime]] = {}

    def record(self, user_id: str, lat: float, lng: float) -> bool:
        """Keep the latest point. Returns False (and forgets) when location
        sharing is off."""
        self.purge()
        if not self._opted_in(user_id):
            self._points.pop(user_id, None)
            return False
        self._points[user_id] = (
            round(lat, DECIMALS),
            round(lng, DECIMALS),
            self._now(),
        )
        return True

    def fresh(self, user_id: str) -> tuple[float, float] | None:
        """The point if it is at most `TTL` old and sharing is still on."""
        found = self._points.get(user_id)
        if found is None:
            return None
        lat, lng, at = found
        if self._now() - at > self._ttl or not self._opted_in(user_id):
            del self._points[user_id]
            return None
        return lat, lng

    def forget(self, user_id: str) -> None:
        self._points.pop(user_id, None)

    def purge(self) -> int:
        now = self._now()
        stale = [u for u, (_, _, at) in self._points.items() if now - at > self._ttl]
        for user_id in stale:
            del self._points[user_id]
        return len(stale)

    def __len__(self) -> int:
        return len(self._points)


_current: PhoneLocation | None = None


def install(store: PhoneLocation) -> PhoneLocation:
    """Called by `app/lanes/surfaces.py` at startup; replaces any earlier store."""
    global _current
    _current = store
    return store


def get(container: Container) -> PhoneLocation:
    """The installed store; without the surfaces lane (`lanes=()`) a store that
    never records, so nothing is held."""
    if _current is None:
        install(PhoneLocation(lambda: container.clock.now(), lambda _user: False))
    assert _current is not None
    return _current
