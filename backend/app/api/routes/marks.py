"""Marks: the map's saved and ghost pins, search, create, detail, save
(ARCHITECTURE.md 7.1, 7.4, 14.2).

GET /marks/nearby, GET /marks/search, POST /marks, GET /marks/{id},
POST/DELETE /marks/{id}/save, GET /me/saved

Coordinates in a response are always a Mark's, never a user's (12.1); the
`lat/lng` a client sends to `/marks/nearby` is used for that query only.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.api.routes.users import UserLite
from app.core.db import SessionDep
from app.ports import Category, MediaType, SaveSource
from app.repositories.marks import SqlMarkRepository
from app.services.marks import (
    Ghost,
    MarkDetail,
    MarkInput,
    MarkService,
    MarkView,
    MomentView,
    NearbyMark,
    SavedItems,
)

router = APIRouter(tags=["marks"])


def get_mark_service(session: SessionDep, container: ContainerDep) -> MarkService:
    return MarkService(SqlMarkRepository(session), container.clock)


MarkServiceDep = Annotated[MarkService, Depends(get_mark_service)]


# --- Schemas -----------------------------------------------------------------


class MarkRead(BaseModel):
    """API `Mark` (14.1)."""

    id: str
    name: str
    category: Category
    lat: float
    lng: float
    address: str
    photo_url: str | None
    price_level: int | None
    vibe_tags: list[str]
    saved: bool
    score: float | None
    friends_score: float | None

    @classmethod
    def from_view(cls, view: MarkView) -> "MarkRead":
        m = view.mark
        return cls(
            id=m.id,
            name=m.name,
            category=m.category,
            lat=m.lat,
            lng=m.lng,
            address=m.address,
            photo_url=m.photo_url,
            price_level=m.price_level,
            vibe_tags=list(m.vibe_tags),
            saved=view.saved,
            score=view.score,
            friends_score=view.friends_score,
        )


class GhostRead(BaseModel):
    user: UserLite
    move_id: str
    at: datetime

    @classmethod
    def from_ghost(cls, ghost: Ghost) -> "GhostRead":
        return cls(
            user=UserLite.model_validate(ghost.user),
            move_id=ghost.move_id,
            at=ghost.at,
        )


class NearbyMarkRead(MarkRead):
    distance_km: float
    ghosts: list[GhostRead]

    @classmethod
    def from_nearby(cls, item: NearbyMark) -> "NearbyMarkRead":
        return cls(
            **MarkRead.from_view(item.view).model_dump(),
            distance_km=round(item.distance_km, 3),
            ghosts=[GhostRead.from_ghost(g) for g in item.ghosts],
        )


class MomentRead(BaseModel):
    id: str
    move_id: str
    author: UserLite
    media_url: str
    media_type: MediaType
    caption: str
    created_at: datetime

    @classmethod
    def from_view(cls, view: MomentView) -> "MomentRead":
        m = view.moment
        return cls(
            id=m.id,
            move_id=m.move_id,
            author=UserLite.model_validate(view.author),
            media_url=m.media_url,
            media_type=m.media_type,
            caption=m.caption,
            created_at=m.created_at,
        )


class TopRankerRead(BaseModel):
    user: UserLite
    score: float


class MarkDetailRead(MarkRead):
    ghosts: list[GhostRead]
    moments: list[MomentRead]
    moves_count: int
    top_ranker: TopRankerRead | None

    @classmethod
    def from_detail(cls, detail: MarkDetail) -> "MarkDetailRead":
        top = detail.top_ranker
        return cls(
            **MarkRead.from_view(detail.view).model_dump(),
            ghosts=[GhostRead.from_ghost(g) for g in detail.ghosts],
            moments=[MomentRead.from_view(m) for m in detail.moments],
            moves_count=detail.moves_count,
            top_ranker=(
                None
                if top is None
                else TopRankerRead(
                    user=UserLite.model_validate(top.user), score=top.score
                )
            ),
        )


class MarkCreate(BaseModel):
    name: str
    category: Category
    lat: float
    lng: float
    address: str = ""
    photo_url: str | None = None
    price_level: int | None = None
    vibe_tags: list[str] = []


class SavedMarkRead(BaseModel):
    mark: MarkRead
    source: SaveSource
    source_ref: str | None
    note: str
    saved_at: datetime


class SavedReelRead(BaseModel):
    id: str
    author_name: str
    thumb_url: str
    video_url: str
    caption: str
    mark_id: str | None
    saved_at: datetime


class SavedRead(BaseModel):
    marks: list[SavedMarkRead]
    reels: list[SavedReelRead]

    @classmethod
    def from_items(cls, items: SavedItems) -> "SavedRead":
        return cls(
            marks=[
                SavedMarkRead(
                    mark=MarkRead.from_view(s.view),
                    source=s.row.source,
                    source_ref=s.row.source_ref,
                    note=s.row.note,
                    saved_at=s.row.saved_at,
                )
                for s in items.marks
            ],
            reels=[
                SavedReelRead(
                    id=reel.id,
                    author_name=reel.author_name,
                    thumb_url=reel.thumb_url,
                    video_url=reel.video_url,
                    caption=reel.caption,
                    mark_id=reel.resolved_mark_id or reel.geotag_mark_id,
                    saved_at=saved.saved_at,
                )
                for saved, reel in items.reels
            ],
        )


# --- Endpoints ---------------------------------------------------------------


@router.get("/marks/nearby")
def nearby_marks(
    user: CurrentUserDep,
    marks: MarkServiceDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(gt=0, le=50)] = 5.0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[NearbyMarkRead]:
    """Saved Marks and Marks with ghosts, nearest first."""
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
