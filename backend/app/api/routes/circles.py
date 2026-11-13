"""Circles management, owner only (ARCHITECTURE.md 12.2, 14.2).

GET/POST /circles, PATCH/DELETE /circles/{id}
"""

from fastapi import APIRouter, status

from app.api.deps_core import CircleServiceDep, CurrentUserDep
from app.models.circles import (
    CircleCreate as CircleCreate,
)
from app.models.circles import (
    CircleRead as CircleRead,
)
from app.models.circles import (
    CircleUpdate as CircleUpdate,
)

router = APIRouter(tags=["circles"])


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
