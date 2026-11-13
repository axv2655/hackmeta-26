"""Finding people and friend requests.

GET    /users/search?q=                    people by name or @username + relation
GET    /friends/requests                   {incoming: [...], outgoing: [...]}
POST   /friends/requests        {user_id}  add friend (accepts if they asked you)
POST   /friends/requests/{user_id}/accept  accept their request
DELETE /friends/requests/{user_id}         decline theirs, or cancel yours
DELETE /friends/{user_id}                  unfriend

`GET /friends` (the list itself) lives in `users.py`.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.models.users import UserLite
from app.services.friends import FriendService, Pending, Relation

router = APIRouter(tags=["friends"])


class PersonOut(BaseModel):
    user: UserLite
    username: str | None
    relation: Relation


class PendingOut(BaseModel):
    user: UserLite
    username: str | None
    created_at: datetime


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
    return [
        PersonOut(
            user=UserLite.model_validate(p.user),
            username=p.username,
            relation=p.relation,
        )
        for p in _service(session, container).search(me.id, q)
    ]


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
