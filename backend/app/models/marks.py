"""HTTP schemas for marks."""

from datetime import datetime

from pydantic import BaseModel

from app.models.users import UserLite
from app.ports import Category, MediaType, SaveSource
from app.services.marks import (
    Ghost,
    MarkDetail,
    MarkView,
    MomentView,
    NearbyMark,
    SavedItems,
)


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
