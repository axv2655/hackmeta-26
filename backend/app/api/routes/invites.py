"""Sharing Moves with people outside the app (ARCHITECTURE.md 9.4).

POST /moves/{id}/invites   make a link + the line to send; the app opens the
                           phone's share sheet so it goes from the user's number
GET  /moves/{id}/invites   shared links: opens and who's coming

The public page the link opens lives in `app/api/invite_page.py`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep
from app.core.config import settings
from app.core.db import SessionDep
from app.domain.invites import (
    InvalidInvite,
    InviteError,
    InviteMoveGone,
    InviteNotAllowed,
    InviteNotFound,
)
from app.services.invites import InviteOut, InviteService
from app.tables import User

router = APIRouter(tags=["invites"])

USER_HEADER = "X-User-Id"


def current_user(
    session: SessionDep,
    x_user_id: Annotated[str | None, Header(alias=USER_HEADER)] = None,
) -> User:
    user = session.get(User, x_user_id) if x_user_id else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or unknown {USER_HEADER}",
            headers={"WWW-Authenticate": USER_HEADER},
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]

STATUS: tuple[tuple[type[InviteError], int], ...] = (
    (InviteNotFound, status.HTTP_404_NOT_FOUND),
    (InviteMoveGone, status.HTTP_409_CONFLICT),
    (InviteNotAllowed, status.HTTP_403_FORBIDDEN),
    (InvalidInvite, status.HTTP_422_UNPROCESSABLE_CONTENT),
)


def as_http(exc: InviteError) -> HTTPException:
    code = next((c for kind, c in STATUS if isinstance(exc, kind)), 400)
    return HTTPException(code, str(exc))


def public_base(request: Request) -> str:
    return str(settings.PUBLIC_BASE_URL or request.base_url).rstrip("/")


class InviteCreate(BaseModel):
    message: str | None = Field(
        default=None, description="Override the line before the link (Muse's)."
    )


class InviteRead(BaseModel):
    id: str
    url: str
    text: str
    body: str = Field(description="text, newline, url: what the share sheet sends")
    created_at: datetime
    opened_at: datetime | None
    open_count: int
    guest_name: str | None
    responded_at: datetime | None

    @classmethod
    def of(cls, out: InviteOut) -> InviteRead:
        return cls(
            id=out.id,
            url=out.url,
            text=out.text,
            body=out.body,
            created_at=out.created_at,
            opened_at=out.opened_at,
            open_count=out.open_count,
            guest_name=out.guest_name,
            responded_at=out.responded_at,
        )


@router.post(
    "/moves/{move_id}/invites",
    response_model=InviteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    move_id: str,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    container: ContainerDep,
    body: InviteCreate | None = None,
) -> InviteRead:
    try:
        out = InviteService(session, container).create(
            user, move_id, body.message if body else None, public_base(request)
        )
    except InviteError as exc:
        raise as_http(exc) from exc
    return InviteRead.of(out)


@router.get("/moves/{move_id}/invites", response_model=list[InviteRead])
def list_invites(
    move_id: str,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    container: ContainerDep,
) -> list[InviteRead]:
    try:
        outs = InviteService(session, container).list_for(
            user, move_id, public_base(request)
        )
    except InviteError as exc:
        raise as_http(exc) from exc
    return [InviteRead.of(o) for o in outs]
