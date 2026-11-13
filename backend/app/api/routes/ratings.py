"""Rate a Move (surfaces S6, ARCHITECTURE.md 13.1, plan A.6).

GET  /moves/{id}/rating/questions   faces, vibe tags, first comparison
POST /moves/{id}/rating/next        `{answers}` -> `{next_comparison}`
POST /moves/{id}/rating             submit -> RatingResult

Errors are domain kinds mapped in `app/api/errors.py`: 404 not visible,
403 not at the Move, 409 already rated, 422 stale answer.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import ContainerDep, HooksDep
from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.services.ratings import (
    NextComparison,
    RatingAnswer,
    RatingQuestions,
    RatingResult,
    RatingService,
    RatingSubmit,
)

router = APIRouter(tags=["ratings"])


def get_rating_service(
    session: SessionDep, container: ContainerDep, hooks: HooksDep
) -> RatingService:
    return RatingService(session, container, hooks)


RatingServiceDep = Annotated[RatingService, Depends(get_rating_service)]


class NextBody(BaseModel):
    answers: list[RatingAnswer] = []


@router.get("/moves/{move_id}/rating/questions", response_model=RatingQuestions)
def rating_questions(
    move_id: str, user: CurrentUserDep, service: RatingServiceDep
) -> RatingQuestions:
    return service.questions(user.id, move_id)


@router.post("/moves/{move_id}/rating/next", response_model=NextComparison)
def rating_next(
    move_id: str, body: NextBody, user: CurrentUserDep, service: RatingServiceDep
) -> NextComparison:
    return service.next(user.id, move_id, body.answers)


@router.post("/moves/{move_id}/rating", response_model=RatingResult)
async def submit_rating(
    move_id: str, body: RatingSubmit, user: CurrentUserDep, service: RatingServiceDep
) -> RatingResult:
    return await service.submit(user.id, move_id, body)
