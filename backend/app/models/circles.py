"""HTTP schemas for circles."""

from pydantic import BaseModel, ConfigDict

from app.models.users import UserLite
from app.services.circles import CircleView


class CircleRead(BaseModel):
    id: str
    name: str
    emoji: str
    fb_group_name: str | None
    members: list[UserLite]

    @classmethod
    def from_view(cls, view: CircleView) -> "CircleRead":
        circle = view.circle
        return cls(
            id=circle.id,
            name=circle.name,
            emoji=circle.emoji,
            fb_group_name=circle.fb_group_name,
            members=[UserLite.model_validate(user) for user in view.members],
        )


class CircleCreate(BaseModel):
    name: str
    emoji: str = ""
    fb_group_name: str | None = None
    member_ids: list[str] = []


class CircleUpdate(BaseModel):
    """Only the fields sent change; `member_ids` replaces the member set."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    emoji: str | None = None
    fb_group_name: str | None = None
    member_ids: list[str] | None = None
