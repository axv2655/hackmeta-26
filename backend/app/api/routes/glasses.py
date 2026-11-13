"""Routes owned by surfaces S9 (ARCHITECTURE.md 14.2, PROMPTS.md S9).

POST /glasses/command  {utterance, lat?, lng?} -> draft + spoken line, posts nothing
POST /glasses/confirm  {draft_id?}             -> posts the pending draft once

Coordinates are used for one nearest-Mark lookup and are never stored or echoed.
"""

from datetime import datetime
from typing import Annotated, Self

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.api.deps import ContainerDep
from app.core.db import SessionDep
from app.ports import Category
from app.services import glasses
from app.services.glasses import DraftExpired, PlaceFailed, PlaceSource
from app.tables import User

router = APIRouter(tags=["glasses"])

USER_HEADER = "X-User-Id"


def current_user_id(
    session: SessionDep,
    x_user_id: Annotated[str | None, Header(alias=USER_HEADER)] = None,
) -> str:
    """Resolve `X-User-Id` (401 when missing or unknown); surfaces owns its copy."""
    user = session.get(User, x_user_id) if x_user_id else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or unknown {USER_HEADER}",
            headers={"WWW-Authenticate": USER_HEADER},
        )
    return user.id


UserIdDep = Annotated[str, Depends(current_user_id)]


class GlassesCommand(BaseModel):
    utterance: str = Field(min_length=1, max_length=2000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _both_or_neither(self) -> Self:
        if (self.lat is None) != (self.lng is None):
            raise ValueError("send lat and lng together, or neither")
        return self


class GlassesDraft(BaseModel):
    understood: bool
    spoken: str
    draft_id: str | None = None
    text: str | None = None
    category: Category | None = None
    place: str | None = None
    place_source: PlaceSource | None = None
    needs_place: bool = False
    expires_at: datetime | None = None


class GlassesConfirm(BaseModel):
    draft_id: str | None = None


class GlassesPosted(BaseModel):
    move_id: str
    text: str
    spoken: str


@router.post("/glasses/command", response_model=GlassesDraft)
async def glasses_command(
    body: GlassesCommand, user_id: UserIdDep, container: ContainerDep
) -> GlassesDraft:
    result = await glasses.service_for(container).command(
        user_id, body.utterance, body.lat, body.lng
    )
    return GlassesDraft(
        understood=result.understood,
        spoken=result.spoken,
        draft_id=result.draft_id,
        text=result.text,
        category=result.category,
        place=result.place,
        place_source=result.place_source,
        needs_place=result.needs_place,
        expires_at=result.expires_at,
    )


@router.post("/glasses/confirm", response_model=GlassesPosted)
async def glasses_confirm(
    body: GlassesConfirm, user_id: UserIdDep, container: ContainerDep
) -> GlassesPosted:
    try:
        result = await glasses.service_for(container).confirm(user_id, body.draft_id)
    except DraftExpired as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PlaceFailed as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return GlassesPosted(move_id=result.move_id, text=result.text, spoken=result.spoken)
