"""Moves: share, view, pull up, arrive, leave, end; the feed and the map
(ARCHITECTURE.md 7.1 to 7.3, 14.2).

POST /moves, GET /moves/nearby, GET /moves/feed, GET /moves/{id},
POST /moves/{id}/join|arrive|leave|end

Handlers only translate: `MoveService` (C4) enforces visibility and the state
machine, and its errors become statuses in `app/api/errors.py`. A Move the
viewer may not see is a 404 on every route, never a 403.

Privacy (12.1): `MoveRead` carries the Mark's coordinates only. The `lat/lng`
sent to `/moves/nearby` is rounded to 3 decimals and used for that one query.
`audience` is filled for the Move's creator only.

Ranking: the feed and the map ask `MuseGateway.rank_moves` for an order and a
one-line reason (10.5). If Muse errors or takes over `RANK_TIMEOUT_S`, the
Moves keep their start-time order (newest first) with no reason.
"""

import asyncio
import logging
from collections.abc import Mapping, Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.concurrency import run_in_threadpool

from app.api.deps import ContainerDep, HooksDep
from app.api.deps_core import CurrentUserDep, UserServiceDep
from app.api.read_cache import cached, invalidate_on_write
from app.api.routes.marks import MarkServiceDep
from app.core.areas import coarse
from app.core.composition import build_move_service
from app.core.db import SessionDep
from app.models.audience import AudienceSummary
from app.models.marks import MarkRead
from app.models.moves import (
    LeaveBody,
)
from app.models.moves import (
    MoveCreateBody as MoveCreateBody,
)
from app.models.moves import (
    MoveRead as MoveRead,
)
from app.models.moves import (
    ParticipantRead as ParticipantRead,
)
from app.models.users import UserLite
from app.ports import (
    MoveSnapshot,
    MuseGateway,
)
from app.services.marks import MarkService, distance_km
from app.services.moves import MoveService

logger = logging.getLogger(__name__)

RANK_TIMEOUT_S = 2.0

router = APIRouter(tags=["moves"], dependencies=[Depends(invalidate_on_write)])


def get_move_service(
    session: SessionDep, container: ContainerDep, hooks: HooksDep
) -> MoveService:
    return build_move_service(session, container.clock, container.events, hooks)


MoveServiceDep = Annotated[MoveService, Depends(get_move_service)]


# --- Presenting --------------------------------------------------------------


class MovePresenter:
    """Turns `MoveSnapshot`s the viewer may see into `MoveRead`s, loading
    people, Mark views and Moment counts once per batch."""

    def __init__(self, viewer_id: str, moves: MoveService, marks: MarkService) -> None:
        self.viewer_id = viewer_id
        self.moves = moves
        self.marks = marks

    def one(self, move: MoveSnapshot) -> MoveRead:
        [read] = self.many([move])
        return read

    def many(
        self, moves: Sequence[MoveSnapshot], reasons: Mapping[str, str] | None = None
    ) -> list[MoveRead]:
        reasons = reasons or {}
        people = self.moves.users(
            {m.creator_id for m in moves}
            | {p.user_id for m in moves for p in m.participants}
        )
        unique_marks = list({m.mark.id: m.mark for m in moves}.values())
        mark_reads = {
            view.mark.id: MarkRead.from_view(view)
            for view in self.marks.views(self.viewer_id, unique_marks)
        }
        moments = self.moves.moments_counts(self.viewer_id, [m.id for m in moves])
        audiences = self.moves.audience_previews(
            self.viewer_id, [m.id for m in moves if m.creator_id == self.viewer_id]
        )

        def lite(user_id: str) -> UserLite:
            return UserLite.model_validate(people[user_id])

        return [
            MoveRead(
                id=m.id,
                creator=lite(m.creator_id),
                mark=mark_reads[m.mark.id],
                text=m.text,
                category=m.category,
                status=m.status,
                kind=m.kind,
                open=m.open,
                starts_at=m.starts_at,
                fill_deadline=m.fill_deadline,
                ends_at=m.ends_at,
                participants=[
                    ParticipantRead(
                        user=lite(p.user_id), status=p.status, joined_via=p.joined_via
                    )
                    for p in m.participants
                ],
                my_status=next(
                    (p.status for p in m.participants if p.user_id == self.viewer_id),
                    None,
                ),
                moments_count=moments.get(m.id, 0),
                muse_reason=reasons.get(m.id) or None,
                audience=(
                    AudienceSummary.from_domain(audiences[m.id])
                    if m.id in audiences
                    else None
                ),
            )
            for m in moves
        ]


def get_presenter(
    me: CurrentUserDep, moves: MoveServiceDep, marks: MarkServiceDep
) -> MovePresenter:
    return MovePresenter(me.id, moves, marks)


PresenterDep = Annotated[MovePresenter, Depends(get_presenter)]


async def rank(
    muse: MuseGateway, viewer_id: str, moves: Sequence[MoveSnapshot]
) -> tuple[list[MoveSnapshot], dict[str, str]]:
    """Muse's order and reasons, falling back to the order given.

    Ids Muse returns that are not in `moves` are ignored, so a ranker can never
    surface a Move the viewer may not see; Moves it leaves out follow the
    ranked ones in their original order.
    """
    if not moves:
        return [], {}
    try:
        ranked = await asyncio.wait_for(
            muse.rank_moves(viewer_id, moves), RANK_TIMEOUT_S
        )
    except Exception:
        logger.warning("ranking moves for %s failed; using start time", viewer_id)
        return list(moves), {}
    by_id = {m.id: m for m in moves}
    reasons = {r.move_id: r.reason for r in ranked if r.move_id in by_id}
    order = list(dict.fromkeys(r.move_id for r in ranked if r.move_id in by_id))
    order += [m.id for m in moves if m.id not in reasons]
    return [by_id[move_id] for move_id in order], reasons


# --- Endpoints ---------------------------------------------------------------


@router.post("/moves", status_code=status.HTTP_201_CREATED)
async def create_move(
    body: MoveCreateBody, me: CurrentUserDep, moves: MoveServiceDep, show: PresenterDep
) -> MoveRead:
    return show.one(await moves.create(me.id, body.to_domain()))


@router.get("/moves/feed")
async def moves_feed(
    request: Request,
    me: CurrentUserDep,
    moves: MoveServiceDep,
    show: PresenterDep,
    c: ContainerDep,
) -> list[MoveRead]:
    """Every live Move the viewer may see, Muse-ranked. Blocking reads run in
    the threadpool; the answer is cached for 5 seconds per viewer."""

    async def compute() -> list[MoveRead]:
        live = await run_in_threadpool(moves.list_live_visible, me.id)
        ranked, reasons = await rank(c.muse, me.id, live)
        return await run_in_threadpool(show.many, ranked, reasons)

    return await cached(request, me.id, c.clock.now, compute)


@router.get("/moves/nearby")
async def moves_nearby(
    request: Request,
    me: CurrentUserDep,
    moves: MoveServiceDep,
    show: PresenterDep,
    c: ContainerDep,
    users: UserServiceDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(gt=0, le=50)] = 5.0,
) -> list[MoveRead]:
    """Live Moves the viewer may see at Marks within `radius_km`, Muse-ranked."""
    here = coarse(lat), coarse(lng)

    # Consent-gated label, never coordinates. Outside the cache so a settings
    # change takes effect on the very next call.
    await run_in_threadpool(users.record_near_area, me.id, *here)

    def find_near() -> list[MoveSnapshot]:
        return [
            m
            for m in moves.list_live_visible(me.id)
            if distance_km(*here, m.mark.lat, m.mark.lng) <= radius_km
        ]

    async def compute() -> list[MoveRead]:
        near = await run_in_threadpool(find_near)
        ranked, reasons = await rank(c.muse, me.id, near)
        return await run_in_threadpool(show.many, ranked, reasons)

    return await cached(request, me.id, c.clock.now, compute)


@router.get("/moves/{move_id}")
def move_detail(
    move_id: str, me: CurrentUserDep, moves: MoveServiceDep, show: PresenterDep
) -> MoveRead:
    return show.one(moves.get(me.id, move_id))


@router.post("/moves/{move_id}/join")
async def join_move(
    move_id: str, me: CurrentUserDep, moves: MoveServiceDep, show: PresenterDep
) -> MoveRead:
    """I'm going."""
    return show.one(await moves.join(me.id, move_id))


@router.post("/moves/{move_id}/arrive")
async def arrive_at_move(
    move_id: str, me: CurrentUserDep, moves: MoveServiceDep, show: PresenterDep
) -> MoveRead:
    return show.one(await moves.arrive(me.id, move_id))


@router.post("/moves/{move_id}/leave")
async def leave_move(
    move_id: str,
    me: CurrentUserDep,
    moves: MoveServiceDep,
    show: PresenterDep,
    body: LeaveBody | None = None,
) -> MoveRead:
    """Take back a Pull up (no ghost), leave (a ghost if you were there), or
    leave quietly with `{"quiet": true}` (no ghost, nobody is told)."""
    quiet = body.quiet if body is not None else False
    return show.one(await moves.leave(me.id, move_id, quiet=quiet))


@router.post("/moves/{move_id}/end")
async def end_move(
    move_id: str, me: CurrentUserDep, moves: MoveServiceDep, show: PresenterDep
) -> MoveRead:
    """The creator ends their Move."""
    return show.one(await moves.end(me.id, move_id))
