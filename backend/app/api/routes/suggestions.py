"""Muse suggestions (ARCHITECTURE.md 10.6, 14.2). Muse lane (M7).

GET /suggestions                      pending, unexpired, newest first
POST /suggestions/{id}/accept         the user's tap: acts on the suggestion
POST /suggestions/{id}/dismiss        optional {never_again}: revive mutes the crew

Muse never posts on its own; accept is the only path from a suggestion to a
Move. A closed (accepted, dismissed, expired) suggestion answers 409, an
unknown one (or someone else's) 404, through the domain error kinds.

`Suggestion` carries `fill_minutes`, `target_move_id`, `group_id`,
`window_start` and `window_end`, read from the stored payload (null when
absent).
"""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import Session

from app.core.db import SessionDep
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import MoveDraftRead
from app.ports import SuggestionSnapshot
from app.services.suggestions import (
    AcceptEdits,
    SuggestionService,
    payload_extras,
    snapshot,
)
from app.tables import Suggestion

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
    fill_minutes: int | None = None
    target_move_id: str | None = None
    group_id: str | None = None
    window_start: str | None = None
    window_end: str | None = None

    @classmethod
    def of(cls, session: Session, s: SuggestionSnapshot) -> "SuggestionOut":
        row = session.get(Suggestion, s.id)
        return cls(
            id=s.id,
            type=s.type,
            message=s.message,
            chips=list(s.chips),
            draft=MoveDraftRead.of(session, s.draft) if s.draft else None,
            status=s.status,
            created_at=s.created_at,
            expires_at=s.expires_at,
            **payload_extras(row.payload if row else None),
        )


class AcceptBody(BaseModel):
    text: str | None = None
    user_ids: list[str] | None = None
    fill_minutes: int | None = None


class AcceptOut(BaseModel):
    suggestion: SuggestionOut
    move_id: str | None = None
    draft: MoveDraftRead | None = None


class DismissBody(BaseModel):
    never_again: bool = False


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
    result = await SuggestionService(session, lane).accept(
        user.id, suggestion_id, edits
    )
    return AcceptOut(
        suggestion=SuggestionOut.of(session, result.suggestion),
        move_id=result.move_id,
        draft=MoveDraftRead.of(session, result.draft) if result.draft else None,
    )


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=SuggestionOut)
def dismiss(
    suggestion_id: str,
    session: SessionDep,
    user: CurrentUser,
    lane: LaneDep,
    body: DismissBody | None = None,
) -> SuggestionOut:
    s = SuggestionService(session, lane).dismiss(
        user.id, suggestion_id, never_again=bool(body and body.never_again)
    )
    return SuggestionOut.of(session, s)
