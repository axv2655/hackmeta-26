"""The demo's coarse areas: shared configuration plus a pure lookup.

Only a label ever leaves this module's callers (`last_area`); coordinates are
used for one comparison and dropped (ARCHITECTURE.md 12.1). The single
supported region is the bounding envelope of the seeded Marks, rounded outward
to 3 decimals; anywhere else has no label, so a query from another city is
never called "Menlo Park".
"""

from dataclasses import dataclass

CENTER = (37.4850, -122.1482)
"""Demo area center: Hacker Square on the Meta campus, 1 Hacker Way, Menlo
Park. Change it to the venue where the demo phones physically are; every seed
Mark is placed relative to it (ARCHITECTURE.md 18)."""

HOME_AREA = "Menlo Park"
COARSE_DECIMALS = 3
"""Precision a client's `lat/lng` is rounded to before any server use."""


@dataclass(frozen=True, slots=True)
class Area:
    label: str
    south: float
    north: float
    west: float
    east: float

    def contains(self, lat: float, lng: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lng <= self.east


AREAS: tuple[Area, ...] = (Area(HOME_AREA, 37.41, 37.623, -122.384, -122.142),)


def coarse(value: float) -> float:
    return round(value, COARSE_DECIMALS)


def coarse_area(lat: float, lng: float) -> str | None:
    """The label of the supported area containing the point, else None."""
    lat, lng = coarse(lat), coarse(lng)
    return next((a.label for a in AREAS if a.contains(lat, lng)), None)
