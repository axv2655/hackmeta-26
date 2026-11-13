"""Simulated proximity (ARCHITECTURE.md 8, plan A.8).

POST /proximity/prompt/{move_id}/accept   one tap on the "add yourself?" prompt
POST /demo/copresence                     Demo Control: put friends together

A Move the caller may not see is a 404 (`MoveNotFound`), an ended Move a 409
(`MoveNotLive`); both are mapped in `app/api/errors.py`. Responses never carry
coordinates.

POST /proximity/token                     rotating BLE token for this phone (8.2)
POST /proximity/sightings                 what this phone's radio saw (8.3)
"""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep, UserServiceDep
from app.api.deps_demo import DemoGuard
from app.api.routes.moves import MoveServiceDep
from app.core.db import SessionDep
from app.domain.errors import MoveNotFound
from app.ports import JoinedVia
from app.repositories.proximity_ble import ingest, issue_token
from app.services.proximity_sweep import (
    ProximitySweep,
    SqlProximityGateway,
    SweepResult,
    arrive_copresent,
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


class BleTokenRead(BaseModel):
    token: str
    uuid: str
    expires_at: datetime


class SightingIn(BaseModel):
    token: str = Field(max_length=64)
    rssi: int = Field(ge=-127, le=20)


class SightingsBody(BaseModel):
    sightings: list[SightingIn] = Field(max_length=200)


class SightingsRead(BaseModel):
    accepted: int
    together: int
    arrived: list[str]  # Move ids where the caller was just marked there
    prompted: list[str]
    auto_joined: list[str]


@router.post("/proximity/token")
async def ble_token(
    me: CurrentUserDep, container: ContainerDep, session: SessionDep
) -> BleTokenRead:
    """A fresh token to advertise (as a service UUID) for the next 15 minutes."""
    issued = issue_token(session, container.clock, me.id)
    return BleTokenRead(
        token=issued.token, uuid=issued.uuid, expires_at=issued.expires_at
    )


@router.post("/proximity/sightings")
async def ble_sightings(
    me: CurrentUserDep,
    body: SightingsBody,
    container: ContainerDep,
    moves: MoveServiceDep,
    session: SessionDep,
) -> SightingsRead:
    """Ingest a batch. If the caller pulled up (`going`) and is now with
    someone `there`, they are marked there. Friends who just came together get
    their live Moves swept once (prompt or auto-join). Never says who was seen."""
    raw = [(s.token, s.rssi) for s in body.sightings]
    fresh = ingest(session, container.clock, me.id, raw)
    engine = session.get_bind()
    gateway = SqlProximityGateway(engine, container.clock)
    arrived = await arrive_copresent(
        engine, container, gateway, [me.id, *fresh], lambda u, m: moves.arrive(u, m)
    )
    result = SweepResult()
    if fresh:
        sweep = ProximitySweep(engine, container, proximity=gateway)
        for move_id in live_move_ids_for(session, [me.id, *fresh]):
            result = result.merged(await sweep.sweep(move_id))
    return SightingsRead(
        accepted=len(raw),
        together=len(fresh),
        arrived=[m for u, m in arrived if u == me.id],
        prompted=[u for u in result.prompted if u == me.id],
        auto_joined=[u for u in result.auto_joined if u == me.id],
    )


@router.post("/demo/copresence")
async def demo_copresence(
    _: DemoGuard,
    body: CopresenceBody,
    container: ContainerDep,
    moves: MoveServiceDep,
    session: SessionDep,
) -> CopresenceRead:
    """Hold (`on`) or drop co-presence for every friend pair among `user_ids`,
    then sweep their live Moves: co-present friends get a prompt, or are
    auto-joined when they asked for that."""
    pairs = set_copresence(session, container.clock, body.user_ids, body.on)
    result = SweepResult()
    if body.on:
        engine = session.get_bind()
        gateway = SqlProximityGateway(engine, container.clock)
        await arrive_copresent(
            engine, container, gateway, body.user_ids, lambda u, m: moves.arrive(u, m)
        )
        sweep = ProximitySweep(engine, container, proximity=gateway)
        for move_id in live_move_ids_for(session, body.user_ids):
            result = result.merged(await sweep.sweep(move_id))
    return CopresenceRead(
        pairs=pairs, prompted=result.prompted, auto_joined=result.auto_joined
    )
