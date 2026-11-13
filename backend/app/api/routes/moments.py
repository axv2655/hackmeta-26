"""Moments (core C8, ARCHITECTURE.md 7.4, 14.2).

GET  /moves/{id}/moments    the Move's Moments the caller may see
POST /moves/{id}/moments    multipart: file, caption, tagged_user_ids (repeated)
POST /moments/{id}/approve  `{approve: bool}` from a tagged user
GET  /media/{filename}      (root, see routes/media.py) the Moment's media;
                            /api/v1/media/{filename} is a legacy alias

Media goes through a route rather than a bare `StaticFiles` mount so a
pending Moment's photo is never reachable by URL alone (rule 1.5.7); like
every other route it needs `X-User-Id`.
"""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.core.composition import build_moment_service
from app.core.config import settings
from app.core.db import SessionDep
from app.models.moments import (
    ApproveBody as ApproveBody,
)
from app.models.moments import (
    MomentRead as MomentRead,
)
from app.models.moments import (
    MomentTagRead as MomentTagRead,
)
from app.services.moments import MomentService

router = APIRouter(tags=["moments"])


def get_media_dir() -> Path:
    return Path(settings.MEDIA_DIR)


def get_moment_service(
    session: SessionDep,
    container: ContainerDep,
    media_dir: Annotated[Path, Depends(get_media_dir)],
) -> MomentService:
    return build_moment_service(
        session,
        container.clock,
        container.events,
        container.notifier,
        media_dir,
        media_url_prefix="/media",
    )


MomentServiceDep = Annotated[MomentService, Depends(get_moment_service)]








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
    """Legacy alias of the canonical `/media/{filename}` (same policy)."""
    return serve_moment_media(moments, user.id, filename)


def serve_moment_media(
    moments: MomentService, viewer_id: str, filename: str
) -> FileResponse:
    media = moments.media(viewer_id, filename)
    return FileResponse(
        media.path,
        media_type=media.content_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            # Consent can be withdrawn, so every fetch must be rechecked.
            "Cache-Control": "private, no-store",
        },
    )
