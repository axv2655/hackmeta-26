"""Moments (core C8, ARCHITECTURE.md 7.4, 14.2).

GET  /moves/{id}/moments    the Move's Moments the caller may see
POST /moves/{id}/moments    multipart: file, caption, tagged_user_ids (repeated)
POST /moments/{id}/approve  `{approve: bool}` from a tagged user
GET  /media/{filename}      the Moment's media, if the caller may see it

Media goes through a route rather than a bare `StaticFiles` mount so a
pending Moment's photo is never reachable by URL alone (rule 1.5.7); like
every other route it needs `X-User-Id`.
"""

from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.api.routes.users import UserLite
from app.core.config import settings
from app.core.db import SessionDep
from app.ports import MediaType, MomentStatus
from app.services.moments import MomentService, MomentView

router = APIRouter(tags=["moments"])


def get_media_dir() -> Path:
    return Path(settings.MEDIA_DIR)


def get_moment_service(
    session: SessionDep,
    container: ContainerDep,
    media_dir: Annotated[Path, Depends(get_media_dir)],
) -> MomentService:
    return MomentService(
        session,
        container.clock,
        container.events,
        container.notifier,
        media_dir,
        media_url_prefix=f"{settings.API_V1_STR}/media",
    )


MomentServiceDep = Annotated[MomentService, Depends(get_moment_service)]


class MomentTagRead(BaseModel):
    user: UserLite
    approved: bool | None


class MomentRead(BaseModel):
    id: str
    move_id: str
    mark_id: str
    author: UserLite
    media_url: str
    media_type: MediaType
    caption: str
    status: MomentStatus
    created_at: datetime
    tags: list[MomentTagRead]

    @classmethod
    def from_view(cls, view: MomentView) -> "MomentRead":
        m = view.moment
        return cls(
            id=m.id,
            move_id=m.move_id,
            mark_id=m.mark_id,
            author=UserLite.model_validate(view.author),
            media_url=m.media_url,
            media_type=m.media_type,
            caption=m.caption,
            status=m.status,
            created_at=m.created_at,
            tags=[
                MomentTagRead(user=UserLite.model_validate(u), approved=a)
                for u, a in view.tags
            ],
        )


class ApproveBody(BaseModel):
    approve: bool


@router.get("/moves/{move_id}/moments")
def list_moments(
    move_id: str, user: CurrentUserDep, moments: MomentServiceDep
) -> list[MomentRead]:
    return [MomentRead.from_view(v) for v in moments.list_for_move(user.id, move_id)]


@router.post("/moves/{move_id}/moments", status_code=201)
async def upload_moment(
    move_id: str,
    user: CurrentUserDep,
    moments: MomentServiceDep,
    file: Annotated[UploadFile, File()],
    caption: Annotated[str, Form()] = "",
    tagged_user_ids: Annotated[list[str] | None, Form()] = None,
) -> MomentRead:
    view = await moments.upload(
        user.id,
        move_id,
        file.file,
        file.content_type,
        caption=caption,
        tagged_ids=tagged_user_ids or (),
    )
    return MomentRead.from_view(view)


@router.post("/moments/{moment_id}/approve")
async def approve_moment(
    moment_id: str, body: ApproveBody, user: CurrentUserDep, moments: MomentServiceDep
) -> MomentRead:
    return MomentRead.from_view(await moments.answer(user.id, moment_id, body.approve))


@router.get("/media/{filename}", response_class=FileResponse)
def get_media(
    filename: str, user: CurrentUserDep, moments: MomentServiceDep
) -> FileResponse:
    media = moments.media(user.id, filename)
    return FileResponse(
        media.path,
        media_type=media.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private"},
    )
