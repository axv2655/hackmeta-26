"""Reels routes (surfaces S4, plan A.7).

GET    /reels?lat&lng            -> Reel[] by id
GET    /reels/{id}/place?lat&lng -> ReelPlace (live Move there, or a Muse draft)
POST   /reels/{id}/save          -> 204 (Saved Reel + Saved Mark from this Reel)
DELETE /reels/{id}/save          -> 204 (removes both)

`lat`/`lng` are optional, rounded to the coarse grid, used once and never
stored. No response carries user coordinates: only Mark lat/lng.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.routes.calendar import CurrentUser
from app.core.db import SessionDep
from app.muse.schemas import MarkOut, MoveDraftRead, MuseUserLite
from app.services.reels import (
    ActiveMoveView,
    PlaceView,
    ReelService,
    ReelView,
    coarse_point,
)

router = APIRouter(tags=["reels"])


class ReelOut(BaseModel):
    id: str
    author_name: str
    video_url: str
    thumb_url: str
    caption: str
    likes: int
    mark: MarkOut | None
    distance_mi: float | None
    saved: bool

    @classmethod
    def of(cls, view: ReelView) -> ReelOut:
        r = view.reel
        return cls(
            id=r.id,
            author_name=r.author_name,
            video_url=r.video_url,
            thumb_url=r.thumb_url,
            caption=r.caption,
            likes=r.likes,
            mark=MarkOut.of(view.mark) if view.mark else None,
            distance_mi=view.distance_mi,
            saved=view.saved,
        )


class ReelActiveMove(BaseModel):
    id: str
    text: str
    creator: MuseUserLite
    participants_count: int
    friends_there: list[MuseUserLite]
    my_status: Literal["going", "there", "left"] | None

    @classmethod
    def of(cls, view: ActiveMoveView) -> ReelActiveMove:
        return cls(
            id=view.move.id,
            text=view.move.text,
            creator=MuseUserLite.of(view.creator),
            participants_count=view.participants_count,
            friends_there=[MuseUserLite.of(u) for u in view.friends_there],
            my_status=view.my_status,
        )


class ReelPlace(BaseModel):
    reel_id: str
    mark: MarkOut | None
    distance_mi: float | None
    active_move: ReelActiveMove | None
    headline: str
    draft: MoveDraftRead | None
    confirm_place: bool


def _place_out(session: SessionDep, view: PlaceView) -> ReelPlace:
    draft = None
    if view.draft is not None:
        draft = MoveDraftRead.of(session, view.draft, confirm_place=view.confirm_place)
    return ReelPlace(
        reel_id=view.reel_id,
        mark=MarkOut.of(view.mark) if view.mark else None,
        distance_mi=view.distance_mi,
        active_move=ReelActiveMove.of(view.active_move) if view.active_move else None,
        headline=view.headline,
        draft=draft,
        confirm_place=view.confirm_place,
    )


@router.get("/reels", response_model=list[ReelOut])
def list_reels(
    user: CurrentUser,
    session: SessionDep,
    container: ContainerDep,
    lat: float | None = None,
    lng: float | None = None,
) -> list[ReelOut]:
    views = ReelService(session, container).feed(user.id, coarse_point(lat, lng))
    return [ReelOut.of(v) for v in views]


@router.get("/reels/{reel_id}/place", response_model=ReelPlace)
async def reel_place(
    reel_id: str,
    user: CurrentUser,
    session: SessionDep,
    container: ContainerDep,
    lat: float | None = None,
    lng: float | None = None,
) -> ReelPlace:
    service = ReelService(session, container)
    view = await service.place(user.id, reel_id, coarse_point(lat, lng))
    return _place_out(session, view)


@router.post("/reels/{reel_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def save_reel(
    reel_id: str, user: CurrentUser, session: SessionDep, container: ContainerDep
) -> Response:
    ReelService(session, container).save(user.id, reel_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/reels/{reel_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def unsave_reel(
    reel_id: str, user: CurrentUser, session: SessionDep, container: ContainerDep
) -> Response:
    ReelService(session, container).unsave(user.id, reel_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
