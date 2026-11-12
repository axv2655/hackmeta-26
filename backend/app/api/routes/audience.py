"""Routes owned by core C2 (ARCHITECTURE.md 14.2).

POST /audience/preview: `{circle_ids, user_ids}` -> `AudienceSummary`, the
composer's AudienceLine. Uses the same resolution as `POST /moves`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.models.audience import (
    AudienceRequest as AudienceRequest,
)
from app.models.audience import (
    AudienceSummary as AudienceSummary,
)
from app.models.audience import (
    CircleRef as CircleRef,
)
from app.repositories.audience import SqlAudienceRepository
from app.services.audience import AudienceService

router = APIRouter(tags=["audience"])


def _audience_service(session: SessionDep) -> AudienceService:
    return AudienceService(SqlAudienceRepository(session))








@router.post("/audience/preview")
def preview_audience(
    body: AudienceRequest,
    me: CurrentUserDep,
    service: Annotated[AudienceService, Depends(_audience_service)],
) -> AudienceSummary:
    preview = service.preview(me.id, body.circle_ids, body.user_ids)
    return AudienceSummary.from_domain(preview)
