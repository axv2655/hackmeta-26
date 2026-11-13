"""Demo Control (ARCHITECTURE.md 15.2). Every route takes `DemoGuard`, so all
of `/demo/*` answers 404 unless `DEMO_MODE` is set. The logic lives in
`app/services/demo.py`; `/demo/copresence` lives in `routes/proximity.py`.

GET  /demo/state          demo mode, demo time, Muse client
POST /demo/time           set, shift or reset demo time
POST /demo/reset          soft reset (never drops anything)
POST /demo/flare-scan     busy block + Saved Mark + forced flare scan
POST /demo/free-time      clear demo blocks + forced free-time scan
POST /demo/revive-scan    refresh crews + revive scan
POST /demo/friend-move    a friend posts a Move (force-notifies the caller)
POST /demo/friend-join    a friend pulls up (going / there)
POST /demo/friend-leave   a friend leaves (a ghost unless quiet)
POST /demo/friend-accept  a seeded user accepts the caller's request
POST /demo/end-move       end a Move as its creator
POST /demo/nobody-bit     nobody-bit suggestion for a quiet Move
GET  /demo/muse-stats     Muse call stats
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep, HooksDep
from app.api.deps_core import CurrentUserDep
from app.api.deps_demo import DemoGuard
from app.api.routes.suggestions import SuggestionOut
from app.core.config import settings
from app.core.db import SessionDep
from app.ports import Category, FreeWindow, SuggestionSnapshot
from app.services.demo import DemoService
from app.services.friends import Relation

router = APIRouter(prefix="/demo", tags=["demo"])


def get_demo_service(
    _: DemoGuard, session: SessionDep, container: ContainerDep, hooks: HooksDep
) -> DemoService:
    return DemoService(session, container, hooks)


DemoServiceDep = Annotated[DemoService, Depends(get_demo_service)]


# --- shapes ------------------------------------------------------------------


class MuseClientOut(BaseModel):
    client: Literal["http", "fake"]
    live: bool


class DemoStateOut(BaseModel):
    demo_mode: Literal["on", "offline"]
    now: datetime
    offset_minutes: float
    muse: MuseClientOut
    user_id: str


class TimeBody(BaseModel):
    iso: str | None = None
    offset_minutes: float | None = None
    reset: bool = False


class TimeOut(BaseModel):
    now: datetime
    offset_minutes: float


class ResetOut(BaseModel):
    now: datetime
    refreshed_moves: int
    expired_suggestions: int
    cleared_blocks: int


class FreeWindowOut(BaseModel):
    start: datetime
    end: datetime
    minutes: int

    @classmethod
    def of(cls, w: FreeWindow | None) -> "FreeWindowOut | None":
        if w is None:
            return None
        return cls(start=w.start, end=w.end, minutes=w.minutes)


class UserBody(BaseModel):
    user_id: str | None = None


class FlareScanBody(UserBody):
    window_minutes: int = Field(default=45, ge=5, le=600)


class ScanOut(BaseModel):
    suggestion: SuggestionOut | None
    window: FreeWindowOut | None = None


class SuggestionResultOut(BaseModel):
    suggestion: SuggestionOut | None


class FriendMoveBody(BaseModel):
    user_id: str
    mark_id: str
    text: str = Field(min_length=1, max_length=280)
    category: Category | None = None
    notify_me: bool = True


class MoveIdOut(BaseModel):
    move_id: str


class FriendJoinBody(BaseModel):
    user_id: str
    move_id: str
    status: Literal["going", "there"] = "going"


class FriendJoinOut(BaseModel):
    move_id: str
    status: str


class FriendLeaveBody(BaseModel):
    user_id: str
    move_id: str
    quiet: bool = False


class FriendLeaveOut(BaseModel):
    move_id: str
    my_status: str | None


class FriendAcceptBody(BaseModel):
    user_id: str


class RelationOut(BaseModel):
    relation: Relation


class MoveBody(BaseModel):
    move_id: str


class EndMoveOut(BaseModel):
    move_id: str
    status: Literal["ended"] = "ended"


def _suggestion(session, snap: SuggestionSnapshot | None) -> SuggestionOut | None:
    return SuggestionOut.of(session, snap) if snap is not None else None


# --- time and state ----------------------------------------------------------


@router.get("/state", response_model=DemoStateOut)
def demo_state(demo: DemoServiceDep, user: CurrentUserDep) -> DemoStateOut:
    return DemoStateOut(
        demo_mode=settings.DEMO_MODE or "on",
        now=demo.now(),
        offset_minutes=demo.offset_minutes(),
        muse=MuseClientOut(**demo.muse_status()),
        user_id=user.id,
    )


@router.post("/time", response_model=TimeOut)
def demo_time(demo: DemoServiceDep, _: CurrentUserDep, body: TimeBody) -> TimeOut:
    demo.set_time(iso=body.iso, offset_minutes=body.offset_minutes, reset=body.reset)
    return TimeOut(now=demo.now(), offset_minutes=demo.offset_minutes())


@router.post("/reset", response_model=ResetOut)
def demo_reset(demo: DemoServiceDep, _: CurrentUserDep) -> ResetOut:
    r = demo.reset()
    return ResetOut(
        now=r.now,
        refreshed_moves=r.refreshed_moves,
        expired_suggestions=r.expired_suggestions,
        cleared_blocks=r.cleared_blocks,
    )


@router.get("/muse-stats")
def demo_muse_stats(
    _: DemoGuard, container: ContainerDep, __: CurrentUserDep
) -> dict[str, Any]:
    return dict(container.muse.muse_stats() or {})


# --- Muse scans --------------------------------------------------------------


@router.post("/flare-scan", response_model=ScanOut)
async def demo_flare_scan(
    demo: DemoServiceDep,
    session: SessionDep,
    user: CurrentUserDep,
    body: FlareScanBody | None = None,
) -> ScanOut:
    body = body or FlareScanBody()
    result = await demo.flare_scan(body.user_id or user.id, body.window_minutes)
    return ScanOut(
        suggestion=_suggestion(session, result.suggestion),
        window=FreeWindowOut.of(result.window),
    )


@router.post("/free-time", response_model=ScanOut)
async def demo_free_time(
    demo: DemoServiceDep,
    session: SessionDep,
    user: CurrentUserDep,
    body: UserBody | None = None,
) -> ScanOut:
    uid = (body.user_id if body else None) or user.id
    result = await demo.free_time(uid)
    return ScanOut(
        suggestion=_suggestion(session, result.suggestion),
        window=FreeWindowOut.of(result.window),
    )


@router.post("/revive-scan", response_model=SuggestionResultOut)
async def demo_revive_scan(
    demo: DemoServiceDep,
    session: SessionDep,
    user: CurrentUserDep,
    body: UserBody | None = None,
) -> SuggestionResultOut:
    uid = (body.user_id if body else None) or user.id
    snap = await demo.revive_scan(uid)
    return SuggestionResultOut(suggestion=_suggestion(session, snap))


@router.post("/nobody-bit", response_model=SuggestionResultOut)
async def demo_nobody_bit(
    demo: DemoServiceDep, session: SessionDep, _: CurrentUserDep, body: MoveBody
) -> SuggestionResultOut:
    snap = await demo.nobody_bit(body.move_id)
    return SuggestionResultOut(suggestion=_suggestion(session, snap))


# --- other people ------------------------------------------------------------


@router.post("/friend-move", response_model=MoveIdOut)
async def demo_friend_move(
    demo: DemoServiceDep, user: CurrentUserDep, body: FriendMoveBody
) -> MoveIdOut:
    move_id = await demo.friend_move(
        user.id,
        body.user_id,
        mark_id=body.mark_id,
        text=body.text,
        category=body.category,
        notify_me=body.notify_me,
    )
    return MoveIdOut(move_id=move_id)


@router.post("/friend-join", response_model=FriendJoinOut)
async def demo_friend_join(
    demo: DemoServiceDep, _: CurrentUserDep, body: FriendJoinBody
) -> FriendJoinOut:
    await demo.friend_join(body.user_id, body.move_id, body.status)
    return FriendJoinOut(move_id=body.move_id, status=body.status)


@router.post("/friend-leave", response_model=FriendLeaveOut)
async def demo_friend_leave(
    demo: DemoServiceDep, _: CurrentUserDep, body: FriendLeaveBody
) -> FriendLeaveOut:
    status = await demo.friend_leave(body.user_id, body.move_id, quiet=body.quiet)
    return FriendLeaveOut(move_id=body.move_id, my_status=status)


@router.post("/friend-accept", response_model=RelationOut)
async def demo_friend_accept(
    demo: DemoServiceDep, user: CurrentUserDep, body: FriendAcceptBody
) -> RelationOut:
    return RelationOut(relation=await demo.friend_accept(user.id, body.user_id))


@router.post("/end-move", response_model=EndMoveOut)
async def demo_end_move(
    demo: DemoServiceDep, _: CurrentUserDep, body: MoveBody
) -> EndMoveOut:
    await demo.end_move(body.move_id)
    return EndMoveOut(move_id=body.move_id)
