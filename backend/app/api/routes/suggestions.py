"""Muse suggestions (ARCHITECTURE.md 10.6, 14.2). Muse lane (M7).

GET /suggestions                      pending, unexpired, newest first
POST /suggestions/{id}/accept         the user's tap: acts on the suggestion
POST /suggestions/{id}/dismiss

Muse never posts on its own; accept is the only path from a suggestion to a
Move. A closed (accepted, dismissed, expired) suggestion answers 409.
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.db import SessionDep
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import MoveDraftRead
from app.ports import SuggestionSnapshot
from app.services.suggestions import (
    AcceptEdits,
    SuggestionClosed,
    SuggestionNotFound,
    SuggestionService,
    snapshot,
)

router = APIRouter(tags=["suggestions"])


class SuggestionOut(BaseModel):
    id: str
    type: str
    message: str
    chips: list[str]
    draft: MoveDraftRead | None = None
    status: str
    created_at: datetime
    expires_at: datetime

    @classmethod
    def of(cls, session, s: SuggestionSnapshot) -> "SuggestionOut":
        return cls(
            id=s.id,
            type=s.type,
            message=s.message,
            chips=list(s.chips),
            draft=MoveDraftRead.of(session, s.draft) if s.draft else None,
            status=s.status,
            created_at=s.created_at,
            expires_at=s.expires_at,
        )


class AcceptBody(BaseModel):
    text: str | None = None
    user_ids: list[str] | None = None
    fill_minutes: int | None = None


class AcceptOut(BaseModel):
    suggestion: SuggestionOut
    move_id: str | None = None
    draft: MoveDraftRead | None = None


def _errors(exc: Exception) -> HTTPException:
    if isinstance(exc, SuggestionNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Suggestion not found")
    return HTTPException(status.HTTP_409_CONFLICT, str(exc))


@router.get("/suggestions", response_model=list[SuggestionOut])
def list_suggestions(
    session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[SuggestionOut]:
    rows = SuggestionService(session, lane).pending(user.id)
    return [SuggestionOut.of(session, snapshot(r)) for r in rows]


@router.post("/suggestions/{suggestion_id}/accept", response_model=AcceptOut)
async def accept(
    suggestion_id: str,
    session: SessionDep,
    user: CurrentUser,
    lane: LaneDep,
    body: AcceptBody | None = None,
) -> AcceptOut:
    edits = None
    if body is not None:
        edits = AcceptEdits(
            text=body.text,
            user_ids=tuple(body.user_ids) if body.user_ids is not None else None,
            fill_minutes=body.fill_minutes,
        )
    try:
        result = await SuggestionService(session, lane).accept(
            user.id, suggestion_id, edits
        )
    except (SuggestionNotFound, SuggestionClosed) as exc:
        raise _errors(exc) from exc
    return AcceptOut(
        suggestion=SuggestionOut.of(session, result.suggestion),
        move_id=result.move_id,
        draft=MoveDraftRead.of(session, result.draft) if result.draft else None,
    )


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=SuggestionOut)
def dismiss(
    suggestion_id: str, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> SuggestionOut:
    try:
        s = SuggestionService(session, lane).dismiss(user.id, suggestion_id)
    except (SuggestionNotFound, SuggestionClosed) as exc:
        raise _errors(exc) from exc
    return SuggestionOut.of(session, s)
