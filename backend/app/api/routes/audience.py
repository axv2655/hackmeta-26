"""Routes owned by core C2 (ARCHITECTURE.md 14.2).

POST /audience/preview: `{circle_ids, user_ids}` -> `AudienceSummary`, the
composer's AudienceLine. Uses the same resolution as `POST /moves`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps_core import CurrentUserDep
from app.api.routes.users import UserLite
from app.core.db import SessionDep
from app.repositories.audience import SqlAudienceRepository
from app.services.audience import AudiencePreview, AudienceService

router = APIRouter(tags=["audience"])


def _audience_service(session: SessionDep) -> AudienceService:
    return AudienceService(SqlAudienceRepository(session))


class AudienceRequest(BaseModel):
    circle_ids: list[str] = []
    user_ids: list[str] = []


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
            people=[UserLite.model_validate(u) for u in preview.people],
        )


@router.post("/audience/preview")
def preview_audience(
    body: AudienceRequest,
    me: CurrentUserDep,
    service: Annotated[AudienceService, Depends(_audience_service)],
) -> AudienceSummary:
    preview = service.preview(me.id, body.circle_ids, body.user_ids)
    return AudienceSummary.from_domain(preview)
