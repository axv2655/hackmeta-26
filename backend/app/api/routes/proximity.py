"""Simulated proximity (ARCHITECTURE.md 8, plan A.8).

POST /proximity/prompt/{move_id}/accept   one tap on the "add yourself?" prompt
POST /demo/copresence                     Demo Control: put friends together

A Move the caller may not see is a 404 (`MoveNotFound`), an ended Move a 409
(`MoveNotLive`); both are mapped in `app/api/errors.py`. Responses never carry
coordinates. Real BLE (`/proximity/token`, `/proximity/sightings`) is not built.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep, UserServiceDep
from app.api.deps_demo import DemoGuard
from app.api.routes.moves import MoveServiceDep
from app.core.db import SessionDep
from app.domain.errors import MoveNotFound
from app.ports import JoinedVia
from app.services.proximity_sweep import (
    ProximitySweep,
    SqlProximityGateway,
    SweepResult,
    friends_of,
    live_move_ids_for,
    set_copresence,
)

router = APIRouter(tags=["proximity"])


class PromptAcceptBody(BaseModel):
    always: bool = False


class PromptAcceptRead(BaseModel):
    move_id: str
    status: str


class CopresenceBody(BaseModel):
    user_ids: list[str] = Field(min_length=2)
    on: bool


class CopresenceRead(BaseModel):
    pairs: int
    prompted: list[str]
    auto_joined: list[str]


@router.post("/proximity/prompt/{move_id}/accept")
async def accept_prompt(
    move_id: str,
    me: CurrentUserDep,
    moves: MoveServiceDep,
    users: UserServiceDep,
    session: SessionDep,
    body: PromptAcceptBody | None = None,
) -> PromptAcceptRead:
    """Join as `there`. `always` also puts every current participant who is a
    friend on the caller's auto-join list, so next time it happens silently."""
    via: JoinedVia = "ble_prompt"
    try:
        moves.get(me.id, move_id)
    except MoveNotFound:
        via = "open_ble"  # join() admits only an open, discoverable Move
    move = await moves.join(me.id, move_id, "there", via)
    if body is not None and body.always:
        friends = friends_of(session, me.id)
        for p in move.participants:
            if p.user_id in friends and p.status != "left":
                users.add_autojoin(me.id, p.user_id)
    return PromptAcceptRead(move_id=move.id, status="there")


@router.post("/demo/copresence")
async def demo_copresence(
    _: DemoGuard, body: CopresenceBody, container: ContainerDep, session: SessionDep
) -> CopresenceRead:
    """Hold (`on`) or drop co-presence for every friend pair among `user_ids`,
    then sweep their live Moves: co-present friends get a prompt, or are
    auto-joined when they asked for that."""
    pairs = set_copresence(session, container.clock, body.user_ids, body.on)
    result = SweepResult()
    if body.on:
        engine = session.get_bind()
        gateway = SqlProximityGateway(engine, container.clock)
        sweep = ProximitySweep(engine, container, proximity=gateway)
        for move_id in live_move_ids_for(session, body.user_ids):
            result = result.merged(await sweep.sweep(move_id))
    return CopresenceRead(
        pairs=pairs, prompted=result.prompted, auto_joined=result.auto_joined
    )
