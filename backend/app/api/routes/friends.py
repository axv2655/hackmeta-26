"""Finding people and friend requests.

GET    /users/search?q=                    people by name or @username + relation
GET    /users/{user_id}                    a profile (404 unknown or blocked)
GET    /friends/suggestions?limit=10       people you may know
GET    /friends/requests                   {incoming: [...], outgoing: [...]}
POST   /friends/requests        {user_id}  add friend (accepts if they asked you)
POST   /friends/requests/{user_id}/accept  accept their request
DELETE /friends/requests/{user_id}         decline theirs, or cancel yours
DELETE /friends/{user_id}                  unfriend

`GET /friends` (the list itself) lives in `users.py`. `/users/{user_id}` is
declared after `/users/search` so it never shadows it.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.models.users import UserLite
from app.ports import Category, ParticipantStatus
from app.services.friends import FriendService, Pending, Person, Profile, Relation

router = APIRouter(tags=["friends"])


class PersonOut(BaseModel):
    user: UserLite
    username: str | None
    relation: Relation
    mutual_count: int

    @classmethod
    def of(cls, p: Person) -> "PersonOut":
        return cls(
            user=UserLite.model_validate(p.user),
            username=p.username,
            relation=p.relation,
            mutual_count=p.mutual_count,
        )


class PendingOut(BaseModel):
    user: UserLite
    username: str | None
    created_at: datetime
    mutual_count: int


class ProfileMark(BaseModel):
    id: str
    name: str


class ProfileMoveOut(BaseModel):
    """A live Move on a profile. Place name only, never coordinates."""

    id: str
    text: str
    category: Category
    mark: ProfileMark
    starts_at: datetime
    my_status: ParticipantStatus | None


class ProfileOut(BaseModel):
    user: UserLite
    username: str | None
    relation: Relation
    mutual_count: int
    mutual: list[UserLite]
    friend_count: int
    moves: list[ProfileMoveOut]

    @classmethod
    def of(cls, p: Profile) -> "ProfileOut":
        return cls(
            user=UserLite.model_validate(p.user),
            username=p.username,
            relation=p.relation,
            mutual_count=p.mutual_count,
            mutual=[UserLite.model_validate(u) for u in p.mutual],
            friend_count=p.friend_count,
            moves=[
                ProfileMoveOut(
                    id=m.id,
                    text=m.text,
                    category=m.category,
                    mark=ProfileMark(id=m.mark_id, name=m.mark_name),
                    starts_at=m.starts_at,
                    my_status=m.my_status,
                )
                for m in p.moves
            ],
        )


class RequestsOut(BaseModel):
    incoming: list[PendingOut]
    outgoing: list[PendingOut]


class RequestIn(BaseModel):
    user_id: str


class RelationOut(BaseModel):
    relation: Relation


def _service(session: SessionDep, container: ContainerDep) -> FriendService:
    return FriendService(session, container.clock, container.notifier)


def _pending(rows: list[Pending]) -> list[PendingOut]:
    return [
        PendingOut(
            user=UserLite.model_validate(p.user),
            username=p.username,
            created_at=p.created_at,
            mutual_count=p.mutual_count,
        )
        for p in rows
    ]


@router.get("/users/search")
def search_people(
    me: CurrentUserDep,
    session: SessionDep,
    container: ContainerDep,
    q: Annotated[str, Query(max_length=80)] = "",
) -> list[PersonOut]:
    return [PersonOut.of(p) for p in _service(session, container).search(me.id, q)]


@router.get("/users/{user_id}")
def read_profile(
    user_id: str, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> ProfileOut:
    return ProfileOut.of(_service(session, container).profile(me.id, user_id))


@router.get("/friends/suggestions")
def friend_suggestions(
    me: CurrentUserDep,
    session: SessionDep,
    container: ContainerDep,
    limit: Annotated[int, Query(ge=1, le=30)] = 10,
) -> list[PersonOut]:
    people = _service(session, container).suggestions(me.id, limit)
    return [PersonOut.of(p) for p in people]


@router.get("/friends/requests")
def list_requests(
    me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> RequestsOut:
    incoming, outgoing = _service(session, container).requests(me.id)
    return RequestsOut(incoming=_pending(incoming), outgoing=_pending(outgoing))


@router.post("/friends/requests")
async def send_request(
    body: RequestIn, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> RelationOut:
    relation = await _service(session, container).request(me.id, body.user_id)
    return RelationOut(relation=relation)


@router.post("/friends/requests/{user_id}/accept")
async def accept_request(
    user_id: str, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> RelationOut:
    return RelationOut(
        relation=await _service(session, container).accept(me.id, user_id)
    )


@router.delete("/friends/requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def drop_request(
    user_id: str, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> None:
    _service(session, container).decline(me.id, user_id)


@router.delete("/friends/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unfriend(
    user_id: str, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> None:
    _service(session, container).unfriend(me.id, user_id)
