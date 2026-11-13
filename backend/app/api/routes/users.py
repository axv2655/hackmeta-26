"""The signed-in user: profile, settings, friends, blocks, auto-join
(ARCHITECTURE.md 12.2, 14.2).

GET /me, PATCH /me {name}, POST /me/verify, PATCH /me/settings, GET /friends,
GET/POST /me/blocks, DELETE /me/blocks/{user_id}, GET/PUT /me/autojoin

`UserLite` is the shared person schema (14.1); other core routes import it.
No user schema carries coordinates (12.1).
"""

from collections.abc import Iterable

from fastapi import APIRouter, status

from app.api.deps_core import CurrentUserDep, UserServiceDep
from app.domain.records import User as UserRecord
from app.models.users import (
    AutojoinUpdate,
    BlockCreate,
    FriendRead,
    MeRead,
    ProfileUpdate,
    QuietHours,
    SettingsRead,
    SettingsUpdate,
    UserLite,
    UserRead,
)
from app.services.users import UserService
from app.tables import User

# Re-exported: other core routes import the shared person schemas from here.
__all__ = [
    "AutojoinUpdate",
    "BlockCreate",
    "FriendRead",
    "MeRead",
    "ProfileUpdate",
    "QuietHours",
    "SettingsRead",
    "SettingsUpdate",
    "UserLite",
    "UserRead",
    "router",
]

router = APIRouter(tags=["users"])


def _people(users: Iterable[User]) -> list[UserLite]:
    return [UserLite.model_validate(user) for user in users]


def _me(user: User | UserRecord, service: UserService) -> MeRead:
    return MeRead(
        user=UserRead.model_validate(user),
        settings=SettingsRead.model_validate(service.settings(user.id)),
    )


@router.get("/me")
def read_me(me: CurrentUserDep, service: UserServiceDep) -> MeRead:
    return _me(me, service)


@router.patch("/me")
def update_me(
    body: ProfileUpdate, me: CurrentUserDep, service: UserServiceDep
) -> MeRead:
    return _me(service.update_profile(me.id, body.name), service)


@router.post("/me/verify")
def verify_me(me: CurrentUserDep, service: UserServiceDep) -> MeRead:
    return _me(service.verify(me.id), service)


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
