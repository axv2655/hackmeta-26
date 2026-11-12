"""HTTP schemas for moments."""

from datetime import datetime

from pydantic import BaseModel

from app.models.users import UserLite
from app.ports import MediaType, MomentStatus
from app.services.moments import MomentView


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
