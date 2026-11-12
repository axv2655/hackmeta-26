"""Muse routes (ARCHITECTURE.md 14.2). Muse lane: M4, M5, M8.

POST /muse/notify-preview (M4), POST /muse/compose-move (M5),
POST /muse/suggest-spots (M8)

(The issues name separate `muse_compose.py` / `muse_spots.py` modules; the
frozen `api/main.py` on this branch includes only this one, so all three
live here.)
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.db import SessionDep
from app.muse.compose import ComposeService
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import MarkOut, MoveDraftRead, picks_out
from app.services.notify import NotifyService
from app.services.taste import TasteService

router = APIRouter(tags=["muse"])


class NotifyPreviewBody(BaseModel):
    mark_id: str
    text: str
    category: str | None = None
    circle_ids: list[str] = []
    user_ids: list[str] = []


@router.post("/muse/notify-preview")
async def notify_preview(
    body: NotifyPreviewBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[dict[str, Any]]:
    """`NotifyPick[]` for a draft that is not posted yet. Nothing is sent."""
    picks = await NotifyService(session, lane).notify_preview(
        user.id,
        mark_id=body.mark_id,
        text=body.text,
        category=body.category,
        circle_ids=body.circle_ids,
        user_ids=body.user_ids,
    )
    return picks_out(session, picks)


class ComposeBody(BaseModel):
    lat: float | None = None
    lng: float | None = None
    mark_id: str | None = None
    seed_text: str | None = None
    heuristic: bool = False
    """True: templates only, instant. Call again without it for Muse's draft."""


@router.post("/muse/compose-move", response_model=MoveDraftRead)
async def compose_move(
    body: ComposeBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> MoveDraftRead:
    """`MoveDraft` for the composer. `lat/lng` are used for this query only and
    never stored. `confirm_place` asks the UI to show "Is this X?"."""
    coarse = (
        (round(body.lat, 3), round(body.lng, 3))
        if body.lat is not None and body.lng is not None
        else None
    )
    composed = await ComposeService(session, lane).compose(
        user.id,
        mark_id=body.mark_id,
        seed_text=body.seed_text,
        coarse=coarse,
        heuristic=body.heuristic,
    )
    return MoveDraftRead.of(
        session,
        composed.draft,
        mark=composed.mark,
        confirm_place=composed.confirm_place,
        source=composed.source,
    )


class SuggestSpotsBody(BaseModel):
    user_ids: list[str] = []
    category: str | None = None
    lat: float | None = None
    lng: float | None = None


class SpotOut(BaseModel):
    mark: MarkOut
    reason: str


@router.post("/muse/suggest-spots", response_model=list[SpotOut])
async def suggest_spots(
    body: SuggestSpotsBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[SpotOut]:
    """3 Marks for the caller plus `user_ids`, with a reason each."""
    coarse = (
        (round(body.lat, 3), round(body.lng, 3))
        if body.lat is not None and body.lng is not None
        else None
    )
    spots = await TasteService(session, lane).suggest_spots(
        user.id, body.user_ids, category=body.category, coarse=coarse
    )
    return [SpotOut(mark=MarkOut.of(m), reason=reason) for m, reason in spots]
