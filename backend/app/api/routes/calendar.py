"""Calendar routes (surfaces S5, plan A.7).

GET /calendar      -> CalendarDay: events now-2h .. now+12h and the free window
PUT /calendar/busy -> 204: replace the caller's title-less blocks in the next 24 h

`CurrentUser` also serves the Reels routes: the surfaces lane may not import
core's `deps_core`, so it resolves `X-User-Id` itself (401 when missing or
unknown), like the muse lane does.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.core.db import SessionDep
from app.ports import FreeWindow
from app.services.calendar import BusyBlock, CalendarService
from app.tables import CalendarEvent, User

USER_HEADER = "X-User-Id"

router = APIRouter(tags=["calendar"])


def current_user(
    session: SessionDep,
    x_user_id: Annotated[str | None, Header(alias=USER_HEADER)] = None,
) -> User:
    user = session.get(User, x_user_id) if x_user_id else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or unknown {USER_HEADER}",
            headers={"WWW-Authenticate": USER_HEADER},
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]


class CalendarEventOut(BaseModel):
    id: str
    title: str | None
    starts_at: datetime
    ends_at: datetime
    place: str | None

    @classmethod
    def of(cls, event: CalendarEvent) -> CalendarEventOut:
        return cls(
            id=event.id,
            title=event.title,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            place=event.location,
        )


class FreeWindowOut(BaseModel):
    start: datetime
    end: datetime
    minutes: int

    @classmethod
    def of(cls, window: FreeWindow) -> FreeWindowOut:
        return cls(start=window.start, end=window.end, minutes=window.minutes)


class CalendarDay(BaseModel):
    events: list[CalendarEventOut]
    free_window: FreeWindowOut | None


class BusyBlockIn(BaseModel):
    start: datetime
    end: datetime


class BusyBlocksIn(BaseModel):
    blocks: list[BusyBlockIn]


@router.get("/calendar", response_model=CalendarDay)
def get_calendar(
    user: CurrentUser, session: SessionDep, container: ContainerDep
) -> CalendarDay:
    now = container.clock.now()
    events = CalendarService(session).day(user.id, now)
    window = container.calendar.free_window(user.id, now)
    return CalendarDay(
        events=[CalendarEventOut.of(e) for e in events],
        free_window=FreeWindowOut.of(window) if window else None,
    )


@router.put("/calendar/busy", status_code=status.HTTP_204_NO_CONTENT)
def put_busy(
    body: BusyBlocksIn, user: CurrentUser, session: SessionDep, container: ContainerDep
) -> Response:
    blocks = [BusyBlock(start=b.start, end=b.end) for b in body.blocks]
    CalendarService(session).replace_busy(user.id, blocks, container.clock.now())
    return Response(status_code=status.HTTP_204_NO_CONTENT)
