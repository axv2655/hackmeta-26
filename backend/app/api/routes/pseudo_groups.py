"""Pseudo-groups (ARCHITECTURE.md 10.8, 14.2). Muse lane (M9).

GET /pseudo-groups                    the caller's groups, fading flag, history
POST /pseudo-groups/{id}/revive       -> `MoveDraft` (nothing is stored)

Pseudo-groups are Muse's private inference and are never shown as real
groups to anyone but their owner.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.db import SessionDep
from app.muse.agents.revive import ReviveService
from app.muse.http import CurrentUser, LaneDep
from app.muse.pseudo_groups import PseudoGroupService
from app.muse.schemas import MoveDraftRead, MuseUserLite
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


@router.get("/pseudo-groups", response_model=list[PseudoGroupOut])
def list_groups(
    session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[PseudoGroupOut]:
    svc = PseudoGroupService(session, lane)
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
            )
        )
    return out


@router.post("/pseudo-groups/{group_id}/revive", response_model=MoveDraftRead)
async def revive(
    group_id: str, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> MoveDraftRead:
    group = session.get(PseudoGroup, group_id)
    if group is None or group.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pseudo-group not found")
    revival = await ReviveService(session, lane).draft_for(group)
    return MoveDraftRead.of(session, revival.draft)
