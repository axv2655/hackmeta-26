"""Marks: the map's saved and ghost pins, search, create, detail, save
(ARCHITECTURE.md 7.1, 7.4, 14.2).

GET /marks/nearby, GET /marks/search, POST /marks, GET /marks/{id},
POST/DELETE /marks/{id}/save, GET /me/saved

Coordinates in a response are always a Mark's, never a user's (12.1); the
`lat/lng` a client sends to `/marks/nearby` is used for that query only.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep, UserServiceDep
from app.core.areas import coarse
from app.core.composition import build_mark_service
from app.core.db import SessionDep
from app.models.marks import (
    GhostRead as GhostRead,
)
from app.models.marks import (
    MarkCreate as MarkCreate,
)
from app.models.marks import (
    MarkDetailRead as MarkDetailRead,
)
from app.models.marks import (
    MarkRead as MarkRead,
)
from app.models.marks import MemoryRead
from app.models.marks import (
    MomentRead as MomentRead,
)
from app.models.marks import (
    NearbyMarkRead as NearbyMarkRead,
)
from app.models.marks import (
    SavedMarkRead as SavedMarkRead,
)
from app.models.marks import (
    SavedRead as SavedRead,
)
from app.models.marks import (
    SavedReelRead as SavedReelRead,
)
from app.models.marks import (
    TopRankerRead as TopRankerRead,
)
from app.services.marks import (
    MarkInput,
    MarkService,
)

router = APIRouter(tags=["marks"])


def get_mark_service(session: SessionDep, container: ContainerDep) -> MarkService:
    return build_mark_service(session, container.clock)


MarkServiceDep = Annotated[MarkService, Depends(get_mark_service)]


# --- Schemas -----------------------------------------------------------------


# --- Endpoints ---------------------------------------------------------------


@router.get("/marks/nearby")
def nearby_marks(
    user: CurrentUserDep,
    marks: MarkServiceDep,
    users: UserServiceDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(gt=0, le=50)] = 5.0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[NearbyMarkRead]:
    """Saved Marks and Marks with ghosts, nearest first."""
    users.record_near_area(user.id, coarse(lat), coarse(lng))  # label only
    found = marks.nearby(user.id, lat, lng, radius_km, limit)
    return [NearbyMarkRead.from_nearby(item) for item in found]


@router.get("/marks/search")
def search_marks(
    user: CurrentUserDep,
    marks: MarkServiceDep,
    q: Annotated[str, Query(min_length=1, max_length=80)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[MarkRead]:
    return [MarkRead.from_view(v) for v in marks.search(user.id, q, limit)]


@router.post("/marks", status_code=status.HTTP_201_CREATED)
def create_mark(
    user: CurrentUserDep, marks: MarkServiceDep, body: MarkCreate
) -> MarkRead:
    fields = body.model_dump(exclude={"vibe_tags"})
    data = MarkInput(**fields, vibe_tags=tuple(body.vibe_tags))
    return MarkRead.from_view(marks.create(user.id, data))


@router.get("/marks/{mark_id}")
def mark_detail(
    user: CurrentUserDep, marks: MarkServiceDep, mark_id: str
) -> MarkDetailRead:
    return MarkDetailRead.from_detail(marks.detail(user.id, mark_id))


@router.post("/marks/{mark_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def save_mark(user: CurrentUserDep, marks: MarkServiceDep, mark_id: str) -> None:
    marks.save(user.id, mark_id, "map", None)


@router.delete("/marks/{mark_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def unsave_mark(user: CurrentUserDep, marks: MarkServiceDep, mark_id: str) -> None:
    marks.require(mark_id)
    marks.unsave(user.id, mark_id)


@router.get("/me/saved")
def my_saved(user: CurrentUserDep, marks: MarkServiceDep) -> SavedRead:
    return SavedRead.from_items(marks.saved(user.id))


@router.get("/me/memories")
def my_memories(
    user: CurrentUserDep,
    marks: MarkServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[MemoryRead]:
    return [MemoryRead.from_memory(m) for m in marks.memories(user.id, limit, offset)]
