"""Routes owned by core C2 (ARCHITECTURE.md 14.2).

POST /audience/preview: `{circle_ids, user_ids}` -> `AudienceSummary`, the
composer's AudienceLine. Uses the same resolution as `POST /moves`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.db import SessionDep
from app.repositories.audience import SqlAudienceRepository
from app.services.audience import AudiencePreview, AudienceService
from app.tables import User

router = APIRouter(tags=["audience"])


def _current_user_id(
    session: SessionDep, x_user_id: Annotated[str | None, Header()] = None
) -> str:
    """Stand-in for C7's current-user dependency in `api/deps_core.py`."""
    if x_user_id is None or session.get(User, x_user_id) is None:
        raise HTTPException(status_code=401, detail="unknown X-User-Id")
    return x_user_id


def _audience_service(session: SessionDep) -> AudienceService:
    return AudienceService(SqlAudienceRepository(session))


class AudienceRequest(BaseModel):
    circle_ids: list[str] = []
    user_ids: list[str] = []


class UserLite(BaseModel):
    id: str
    name: str
    first_name: str
    avatar_url: str
    avatar_color: str
    fb_verified: bool


class CircleRef(BaseModel):
    id: str
    name: str


class AudienceSummary(BaseModel):
    count: int
    circles: list[CircleRef]
    people: list[UserLite]

    @classmethod
    def from_domain(cls, preview: AudiencePreview) -> "AudienceSummary":
        return cls(
            count=preview.count,
            circles=[CircleRef(id=c.id, name=c.name) for c in preview.circles],
            people=[
                UserLite.model_validate(u, from_attributes=True) for u in preview.people
            ],
        )


@router.post("/audience/preview")
def preview_audience(
    body: AudienceRequest,
    user_id: Annotated[str, Depends(_current_user_id)],
    service: Annotated[AudienceService, Depends(_audience_service)],
) -> AudienceSummary:
    preview = service.preview(user_id, body.circle_ids, body.user_ids)
    return AudienceSummary.from_domain(preview)
