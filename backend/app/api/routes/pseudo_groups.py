"""Pseudo-groups ("crews") and the caller's taste (ARCHITECTURE.md 10.8, 14.2).

GET /pseudo-groups                    the caller's groups, fading, history, muted
POST /pseudo-groups/{id}/revive       -> `MoveDraft` (nothing is stored)
POST /pseudo-groups/{id}/mute         204: Muse stops suggesting this crew (F31)
DELETE /pseudo-groups/{id}/mute       204: undo
GET /me/taste                         `Taste | null` (JSON null without a profile)

Pseudo-groups are Muse's private inference and are never shown as real
groups to anyone but their owner; anyone else gets 404. Mutes are keyed by
member set (owner excluded), so they survive a refresh that re-creates rows.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlmodel import Session

from app.core.db import SessionDep
from app.domain.pseudo_groups import PseudoGroupNotFound
from app.muse import mutes
from app.muse.agents.revive import ReviveService
from app.muse.http import CurrentUser, LaneDep
from app.muse.pseudo_groups import PseudoGroupService
from app.muse.schemas import MoveDraftRead, MuseUserLite
from app.services.taste import TasteService
from app.tables import PseudoGroup, User

router = APIRouter(tags=["pseudo-groups"])


class PseudoGroupOut(BaseModel):
    id: str
    label: str
    members: list[MuseUserLite]
    pattern: dict[str, list[Any]]
    strength: float
    fading: bool
    last_hangout_at: datetime | None
    history: list[int]
    """Hangouts per week, oldest first (12 weeks) for the sparkline."""
    muted: bool = False


class TasteOut(BaseModel):
    summary: str
    likes: list[str]
    dislikes: list[str]
    updated_at: datetime


def _owned(session: Session, owner_id: str, group_id: str) -> PseudoGroup:
    group = session.get(PseudoGroup, group_id)
    if group is None or group.owner_id != owner_id:
        raise PseudoGroupNotFound(group_id)
    return group


@router.get("/pseudo-groups", response_model=list[PseudoGroupOut])
def list_groups(
    session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[PseudoGroupOut]:
    svc = PseudoGroupService(session, lane)
    muted = mutes.muted_keys(session, user.id)
    out = []
    for g in svc.owned(user.id):
        members = [
            MuseUserLite.of(u) for uid in g.member_ids if (u := session.get(User, uid))
        ]
        out.append(
            PseudoGroupOut(
                id=g.id,
                label=g.label,
                members=members,
                pattern=g.pattern,
                strength=g.strength,
                fading=g.fading,
                last_hangout_at=g.last_hangout_at,
                history=svc.history(g),
                muted=mutes.members_key(g.member_ids, user.id) in muted,
            )
        )
    return out


@router.post("/pseudo-groups/{group_id}/revive", response_model=MoveDraftRead)
async def revive(
    group_id: str, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> MoveDraftRead:
    group = _owned(session, user.id, group_id)
    revival = await ReviveService(session, lane).draft_for(group)
    return MoveDraftRead.of(session, revival.draft)


@router.post("/pseudo-groups/{group_id}/mute", status_code=status.HTTP_204_NO_CONTENT)
def mute(
    group_id: str, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> Response:
    group = _owned(session, user.id, group_id)
    mutes.mute(session, user.id, group.member_ids, lane.now())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/pseudo-groups/{group_id}/mute", status_code=status.HTTP_204_NO_CONTENT)
def unmute(group_id: str, session: SessionDep, user: CurrentUser) -> Response:
    group = _owned(session, user.id, group_id)
    mutes.unmute(session, user.id, group.member_ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/taste", response_model=TasteOut | None)
def my_taste(session: SessionDep, user: CurrentUser, lane: LaneDep) -> TasteOut | None:
    row = TasteService(session, lane).profile("user", user.id)
    if row is None:
        return None
    return TasteOut(
        summary=row.summary,
        likes=list(row.likes),
        dislikes=list(row.dislikes),
        updated_at=row.updated_at,
    )
