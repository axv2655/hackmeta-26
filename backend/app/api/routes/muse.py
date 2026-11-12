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
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import picks_out
from app.services.notify import NotifyService

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
