"""Where the map is looking (ARCHITECTURE.md 12.1).

GET /areas/city?lat&lng   the city at the center of the map, for the Moves
                          header: {"name": "Redwood City", "region": "California"}

The point is the map's center, sent coarse; the server rounds it to ~1 km,
never stores it, and keeps it out of the access log.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps_core import CurrentUserDep
from app.core.config import settings
from app.services.cities import CityService, nominatim

router = APIRouter(tags=["areas"])


class CityOut(BaseModel):
    name: str | None
    region: str | None


@lru_cache(maxsize=1)
def get_city_service() -> CityService:
    url = settings.GEOCODER_URL.strip()
    return CityService(nominatim(url) if url else None)


CityServiceDep = Annotated[CityService, Depends(get_city_service)]


@router.get("/areas/city")
def city_at(
    _: CurrentUserDep,
    cities: CityServiceDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
) -> CityOut:
    found = cities.city(lat, lng)
    return CityOut(name=found.name, region=found.region)
