"""More Demo Control routes (ARCHITECTURE.md 15.2); the logic lives in
`app/services/demo_stage.py`. Like `routes/demo.py`, every route takes
`DemoGuard`, so all of it answers 404 unless `DEMO_MODE` is set.

POST /demo/friend-request   someone sends the caller a friend request
POST /demo/moment           a friend at the caller's Move posts a Moment tagging them
POST /demo/route            the caller and a friend both head to a far Mark (route card)
POST /demo/muse-mode        Muse live or heuristic, at runtime
POST /demo/notify-test      a test notification (and push) to the caller
GET  /demo/jobs             the scheduler jobs this server runs
POST /demo/jobs/{name}      run one of them now
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.api.deps import ContainerDep, HooksDep
from app.api.deps_core import CurrentUserDep
from app.api.deps_demo import DemoGuard
from app.api.routes.suggestions import SuggestionOut
from app.core.db import SessionDep
from app.scheduler.loop import Scheduler
from app.seed import ids
from app.services.demo_stage import DemoStage, job_names, run_job
from app.services.friends import Relation

router = APIRouter(prefix="/demo", tags=["demo"])


def get_demo_stage(
    _: DemoGuard, session: SessionDep, container: ContainerDep, hooks: HooksDep
) -> DemoStage:
    return DemoStage(session, container, hooks)


DemoStageDep = Annotated[DemoStage, Depends(get_demo_stage)]


def get_scheduler(_: DemoGuard, request: Request) -> Scheduler | None:
    return getattr(request.app.state, "scheduler", None)


SchedulerDep = Annotated[Scheduler | None, Depends(get_scheduler)]


class FriendRequestBody(BaseModel):
    user_id: str | None = None


class FriendRequestOut(BaseModel):
    user_id: str
    relation: Relation


class MomentBody(BaseModel):
    user_id: str
    move_id: str | None = None


class MomentOut(BaseModel):
    moment_id: str
    move_id: str


class RouteBody(BaseModel):
    user_id: str
    mark_id: str = ids.KUMO_MATCHA
    companion_id: str | None = None


class RouteOut(BaseModel):
    move_id: str
    companion_id: str
    suggestion: SuggestionOut | None


class MuseModeBody(BaseModel):
    live: bool


class MuseModeOut(BaseModel):
    deterministic: bool


class NotifyTestOut(BaseModel):
    notification_id: str


class JobsOut(BaseModel):
    jobs: list[str]


class JobRunOut(BaseModel):
    name: str
    result: str | None


@router.post("/friend-request", response_model=FriendRequestOut)
async def demo_friend_request(
    stage: DemoStageDep, user: CurrentUserDep, body: FriendRequestBody | None = None
) -> FriendRequestOut:
    r = await stage.friend_request(user.id, body.user_id if body else None)
    return FriendRequestOut(user_id=r.user_id, relation=r.relation)


@router.post("/moment", response_model=MomentOut)
async def demo_moment(
    stage: DemoStageDep, user: CurrentUserDep, body: MomentBody
) -> MomentOut:
    r = await stage.moment(user.id, body.user_id, body.move_id)
    return MomentOut(moment_id=r.moment_id, move_id=r.move_id)


@router.post("/route", response_model=RouteOut)
async def demo_route(
    stage: DemoStageDep, session: SessionDep, user: CurrentUserDep, body: RouteBody
) -> RouteOut:
    r = await stage.route(
        user.id, body.user_id, mark_id=body.mark_id, companion_id=body.companion_id
    )
    snap = r.suggestion
    return RouteOut(
        move_id=r.move_id,
        companion_id=r.companion_id,
        suggestion=SuggestionOut.of(session, snap) if snap is not None else None,
    )


@router.post("/muse-mode", response_model=MuseModeOut)
def demo_muse_mode(
    stage: DemoStageDep, _: CurrentUserDep, body: MuseModeBody
) -> MuseModeOut:
    return MuseModeOut(deterministic=stage.set_muse_live(body.live))


@router.post("/notify-test", response_model=NotifyTestOut)
async def demo_notify_test(stage: DemoStageDep, user: CurrentUserDep) -> NotifyTestOut:
    return NotifyTestOut(notification_id=await stage.notify_test(user.id))


@router.get("/jobs", response_model=JobsOut)
def demo_jobs(scheduler: SchedulerDep, _: CurrentUserDep) -> JobsOut:
    return JobsOut(jobs=job_names(scheduler))


@router.post("/jobs/{name}", response_model=JobRunOut)
async def demo_run_job(
    name: str, scheduler: SchedulerDep, _: CurrentUserDep
) -> JobRunOut:
    return JobRunOut(name=name, result=_summary(await run_job(scheduler, name)))


def _summary(result: Any) -> str | None:
    """A job returns a count, a list of ids, or nothing: say how many."""
    if result is None or isinstance(result, bool):
        return None
    if isinstance(result, list | tuple | set | frozenset | dict):
        return str(len(result))
    return str(result)
