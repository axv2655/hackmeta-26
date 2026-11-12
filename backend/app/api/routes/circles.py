"""Circles management, owner only (ARCHITECTURE.md 12.2, 14.2).

GET/POST /circles, PATCH/DELETE /circles/{id}
"""

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict

from app.api.deps_core import CircleServiceDep, CoreRoute, CurrentUserDep
from app.api.routes.users import UserLite
from app.services.circles import CircleView

router = APIRouter(tags=["circles"], route_class=CoreRoute)


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


@router.get("/circles")
def list_circles(me: CurrentUserDep, service: CircleServiceDep) -> list[CircleRead]:
    return [CircleRead.from_view(view) for view in service.list_owned(me.id)]


@router.post("/circles", status_code=status.HTTP_201_CREATED)
def create_circle(
    body: CircleCreate, me: CurrentUserDep, service: CircleServiceDep
) -> CircleRead:
    view = service.create(
        me.id,
        body.name,
        body.member_ids,
        emoji=body.emoji,
        fb_group_name=body.fb_group_name,
    )
    return CircleRead.from_view(view)


@router.patch("/circles/{circle_id}")
def update_circle(
    circle_id: str, body: CircleUpdate, me: CurrentUserDep, service: CircleServiceDep
) -> CircleRead:
    changes = body.model_dump(exclude_unset=True)
    return CircleRead.from_view(service.update(me.id, circle_id, changes))


@router.delete("/circles/{circle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_circle(
    circle_id: str, me: CurrentUserDep, service: CircleServiceDep
) -> None:
    service.delete(me.id, circle_id)
