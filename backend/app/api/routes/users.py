"""The signed-in user: profile, settings, friends, blocks, auto-join
(ARCHITECTURE.md 12.2, 14.2).

GET /me, PATCH /me/settings, GET /friends,
GET/POST /me/blocks, DELETE /me/blocks/{user_id}, GET/PUT /me/autojoin

`UserLite` is the shared person schema (14.1); other core routes import it.
No user schema carries coordinates (12.1).
"""

from collections.abc import Iterable
from datetime import datetime

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps_core import CoreRoute, CurrentUserDep, UserServiceDep
from app.ports import Category
from app.services.users import FriendTier
from app.tables import User

router = APIRouter(tags=["users"], route_class=CoreRoute)


class UserLite(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    first_name: str
    avatar_url: str
    avatar_color: str
    fb_verified: bool


class UserRead(UserLite):
    home_area: str


class QuietHours(BaseModel):
    start: int = Field(ge=0, le=23)
    end: int = Field(ge=0, le=23)


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location_opt_in: bool
    ble_opt_in: bool
    calendar_opt_in: bool
    open_moves_opt_in: bool
    muse_proactive: bool
    ghost_visible: bool
    default_circle_ids: list[str]
    move_categories: list[Category]
    quiet_hours: QuietHours | None


class SettingsUpdate(BaseModel):
    """Only the fields sent are changed; `quiet_hours: null` clears them."""

    model_config = ConfigDict(extra="forbid")

    location_opt_in: bool | None = None
    ble_opt_in: bool | None = None
    calendar_opt_in: bool | None = None
    open_moves_opt_in: bool | None = None
    muse_proactive: bool | None = None
    ghost_visible: bool | None = None
    default_circle_ids: list[str] | None = None
    move_categories: list[Category] | None = None
    quiet_hours: QuietHours | None = None


class MeRead(BaseModel):
    user: UserRead
    settings: SettingsRead


class FriendRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserLite
    tier: FriendTier
    since: datetime


class BlockCreate(BaseModel):
    user_id: str


class AutojoinUpdate(BaseModel):
    user_ids: list[str]


def _people(users: Iterable[User]) -> list[UserLite]:
    return [UserLite.model_validate(user) for user in users]


@router.get("/me")
def read_me(me: CurrentUserDep, service: UserServiceDep) -> MeRead:
    return MeRead(
        user=UserRead.model_validate(me),
        settings=SettingsRead.model_validate(service.settings(me.id)),
    )


@router.patch("/me/settings")
def update_settings(
    body: SettingsUpdate, me: CurrentUserDep, service: UserServiceDep
) -> SettingsRead:
    changes = body.model_dump(exclude_unset=True)
    return SettingsRead.model_validate(service.update_settings(me.id, changes))


@router.get("/friends")
def list_friends(me: CurrentUserDep, service: UserServiceDep) -> list[FriendRead]:
    return [FriendRead.model_validate(friend) for friend in service.friends(me.id)]


@router.get("/me/blocks")
def list_blocks(me: CurrentUserDep, service: UserServiceDep) -> list[UserLite]:
    return _people(service.blocked(me.id))


@router.post("/me/blocks", status_code=status.HTTP_201_CREATED)
def add_block(
    body: BlockCreate, me: CurrentUserDep, service: UserServiceDep
) -> list[UserLite]:
    service.block(me.id, body.user_id)
    return _people(service.blocked(me.id))


@router.delete("/me/blocks/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_block(user_id: str, me: CurrentUserDep, service: UserServiceDep) -> None:
    service.unblock(me.id, user_id)


@router.get("/me/autojoin")
def list_autojoin(me: CurrentUserDep, service: UserServiceDep) -> list[UserLite]:
    return _people(service.autojoin(me.id))


@router.put("/me/autojoin")
def set_autojoin(
    body: AutojoinUpdate, me: CurrentUserDep, service: UserServiceDep
) -> list[UserLite]:
    return _people(service.set_autojoin(me.id, body.user_ids))
