"""Proximity service (surfaces lane, S1).

Only the pure rules and cluster math live here for now. Token issue, sighting
ingest, the `copresence` / `proximity_sightings` tables, the routes, the
purge job and `ProximityGateway` are added once the T0 contract is merged.

Privacy (ARCHITECTURE.md 8.4): devices never broadcast user ids, co-presence
is only between friends, and nothing here produces a "who is near me" list.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta

RSSI_MIN = -75  # dBm; weaker sightings are dropped
TOKEN_TTL = timedelta(minutes=15)
COPRESENCE_WINDOW = timedelta(seconds=60)
PURGE_AGE = timedelta(hours=2)


def keep_sighting(rssi: int) -> bool:
    return rssi >= RSSI_MIN


def is_token_valid(issued_at: datetime, now: datetime) -> bool:
    """A token is valid from issue until, but not including, issue + TTL."""
    return timedelta(0) <= now - issued_at < TOKEN_TTL


def is_copresent(last_seen: datetime, now: datetime) -> bool:
    """Co-present if seen within the last 60 s (inclusive)."""
    return timedelta(0) <= now - last_seen <= COPRESENCE_WINDOW


def is_purgeable(seen_at: datetime, now: datetime) -> bool:
    """Raw sightings strictly older than 2 h are purged."""
    return now - seen_at > PURGE_AGE


def pair_key(a: str, b: str) -> tuple[str, str]:
    """Canonical, order-independent key for a pair of users."""
    if a == b:
        raise ValueError("a user cannot be co-present with themselves")
    return (a, b) if a < b else (b, a)


def cluster_of(user_id: str, pairs: Iterable[tuple[str, str]]) -> frozenset[str]:
    """Connected component of the co-presence graph containing `user_id`."""
    neighbours: dict[str, set[str]] = {}
    for a, b in pairs:
        neighbours.setdefault(a, set()).add(b)
        neighbours.setdefault(b, set()).add(a)
    seen = {user_id}
    frontier = [user_id]
    while frontier:
        current = frontier.pop()
        for other in neighbours.get(current, ()):
            if other not in seen:
                seen.add(other)
                frontier.append(other)
    return frozenset(seen)
