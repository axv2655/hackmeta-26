"""Request/response models for muse routes (ARCHITECTURE.md 14.1).

Privacy (12.1): user-shaped models never carry coordinates; only `MarkOut`
has lat/lng.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlmodel import Session

from app.ports import Category, MarkSnapshot, MoveDraftOut, NotifyPickOut
from app.tables import Mark, Notification, User


class MuseUserLite(BaseModel):
    id: str
    name: str
    first_name: str
    avatar_url: str = ""
    avatar_color: str = ""
    fb_verified: bool = False

    @classmethod
    def of(cls, user: User) -> MuseUserLite:
        return cls(
            id=user.id,
            name=user.name,
            first_name=user.first_name,
            avatar_url=user.avatar_url,
            avatar_color=user.avatar_color,
            fb_verified=user.fb_verified,
        )


class MarkOut(BaseModel):
    id: str
    name: str
    category: Category
    lat: float
    lng: float
    address: str = ""
    photo_url: str | None = None
    vibe_tags: list[str] = []

    @classmethod
    def of(cls, mark: Mark | MarkSnapshot) -> MarkOut:
        return cls(
            id=mark.id,
            name=mark.name,
            category=mark.category,
            lat=mark.lat,
            lng=mark.lng,
            address=mark.address or "",
            photo_url=mark.photo_url,
            vibe_tags=list(mark.vibe_tags or ()),
        )


def picks_out(session: Session, picks: list[NotifyPickOut]) -> list[dict[str, Any]]:
    """API `NotifyPick` dicts: `{user: UserLite, copy, reason}`."""
    out = []
    for p in picks:
        user = session.get(User, p.user_id)
        if user is not None:
            out.append(
                {
                    "user": MuseUserLite.of(user).model_dump(),
                    "copy": p.copy,
                    "reason": p.reason,
                }
            )
    return out


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: dict[str, str]
    read_at: datetime | None = None
    created_at: datetime

    @classmethod
    def of(cls, n: Notification) -> NotificationOut:
        return cls(
            id=n.id,
            type=n.type,
            title=n.title,
            body=n.body,
            data=dict(n.data),
            read_at=n.read_at,
            created_at=n.created_at,
        )


class MoveDraftRead(BaseModel):
    """API `MoveDraft` (14.1) plus composer extras."""

    mark: MarkOut | None
    text: str
    category: Category
    kind: str = "move"
    alternates: list[str] = []
    circle_ids: list[str] = []
    user_ids: list[str] = []
    notify: list[dict[str, Any]] = []
    fill_minutes: int | None = None
    chips: list[str] = []
    nearby_mark_ids: list[str] = []
    confirm_place: bool = False
    source: str = "muse"

    @classmethod
    def of(
        cls,
        session: Session,
        draft: MoveDraftOut,
        *,
        mark: Mark | MarkSnapshot | None = None,
        **extra: Any,
    ) -> MoveDraftRead:
        if mark is None and draft.mark_id:
            mark = session.get(Mark, draft.mark_id)
        return cls(
            mark=MarkOut.of(mark) if mark else None,
            text=draft.text,
            category=draft.category,
            kind=draft.kind,
            alternates=list(draft.alternates),
            circle_ids=list(draft.circle_ids),
            user_ids=list(draft.user_ids),
            notify=picks_out(session, list(draft.notify)),
            fill_minutes=draft.fill_minutes,
            chips=list(draft.chips),
            nearby_mark_ids=list(draft.nearby_mark_ids),
            **extra,
        )
