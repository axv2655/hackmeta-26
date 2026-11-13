"""Notifications (ARCHITECTURE.md 9.1, 14.2). Muse lane (M4).

GET /notifications, POST /notifications/read

Every notification is stored, so a missed socket event is never lost; the
Notifications tab lists them newest first.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import col, select

from app.core.db import SessionDep
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import NotificationOut
from app.tables import Notification

router = APIRouter(tags=["notifications"])

LIST_LIMIT = 100


class ReadBody(BaseModel):
    """`ids` to mark read; omit to mark every notification read."""

    ids: list[str] | None = None


class ReadResult(BaseModel):
    updated: int


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    session: SessionDep, user: CurrentUser, unread_only: bool = False
) -> list[NotificationOut]:
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(col(Notification.read_at).is_(None))
    rows = session.exec(
        query.order_by(col(Notification.created_at).desc()).limit(LIST_LIMIT)
    ).all()
    return [NotificationOut.of(n) for n in rows]


@router.post("/notifications/read", response_model=ReadResult)
def mark_read(
    session: SessionDep, user: CurrentUser, lane: LaneDep, body: ReadBody | None = None
) -> ReadResult:
    query = select(Notification).where(
        Notification.user_id == user.id, col(Notification.read_at).is_(None)
    )
    if body is not None and body.ids is not None:
        query = query.where(col(Notification.id).in_(body.ids))
    now = lane.now()
    rows = session.exec(query).all()
    for n in rows:
        n.read_at = now
        session.add(n)
    session.commit()
    return ReadResult(updated=len(rows))
