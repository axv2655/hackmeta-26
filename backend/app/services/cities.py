"""The city at a point on the map, for the Moves header ("Menlo Park",
"Redwood City").

The client sends the center of what it's looking at, already coarse. Here it
is rounded again to about a kilometre, so nearby centers share one answer and
one cache entry, and nothing finer ever reaches the geocoder. Nothing is
stored beyond an in-memory cache of label by rounded cell.

    lookup    any `Geocoder` (Nominatim by default), cached and throttled to
              one outside call a second
    fallback  the configured `AREAS` labels, when the geocoder is off, slow
              or down, so the header never breaks the demo
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from app.core.areas import coarse_area

CELL_DECIMALS = 2  # ~1 km: coarse enough to share, fine enough for city lines
CACHE_SIZE = 4096
MIN_GAP_S = 1.1  # Nominatim's usage policy: at most one request a second
USER_AGENT = "hackmeta-26-moves/0.1"


@dataclass(frozen=True, slots=True)
class City:
    name: str | None
    region: str | None = None


Geocoder = Callable[[float, float], City | None]


def nominatim(base_url: str, timeout: float = 4.0) -> Geocoder:
    """A geocoder over a Nominatim `/reverse` endpoint at city zoom."""

    def lookup(lat: float, lng: float) -> City | None:
        res = httpx.get(
            f"{base_url.rstrip('/')}/reverse",
            params={"format": "jsonv2", "lat": lat, "lon": lng, "zoom": 10},
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=timeout,
        )
        res.raise_for_status()
        body = res.json()
        address = body.get("address") or {}
        name = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("municipality")
            or body.get("name")
            or address.get("county")
        )
        return City(name, address.get("state")) if name else None

    return lookup


class CityService:
    def __init__(
        self,
        geocoder: Geocoder | None,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.geocoder = geocoder
        self.sleep = sleep
        self.monotonic = monotonic
        self._cache: OrderedDict[tuple[float, float], City] = OrderedDict()
        self._lock = threading.Lock()
        self._last_call = -MIN_GAP_S

    def city(self, lat: float, lng: float) -> City:
        cell = (round(lat, CELL_DECIMALS), round(lng, CELL_DECIMALS))
        with self._lock:
            hit = self._cache.get(cell)
            if hit is not None:
                self._cache.move_to_end(cell)
                return hit
            found = self._ask(*cell)
            if found is not None:
                self._remember(cell, found)
                return found
        return City(coarse_area(*cell))

    def _ask(self, lat: float, lng: float) -> City | None:
        if self.geocoder is None:
            return None
        wait = self._last_call + MIN_GAP_S - self.monotonic()
        if wait > 0:
            self.sleep(wait)
        self._last_call = self.monotonic()
        try:
            return self.geocoder(lat, lng)
        except (httpx.HTTPError, ValueError, KeyError):
            return None

    def _remember(self, cell: tuple[float, float], city: City) -> None:
        self._cache[cell] = city
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
