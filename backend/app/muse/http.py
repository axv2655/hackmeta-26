"""FastAPI glue for muse routes: the caller's identity and the lane.

The muse lane may not import core's `deps_core`, so it resolves `X-User-Id`
itself, the same way (401 when missing or unknown).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.api.deps import ContainerDep
from app.core.db import SessionDep
from app.muse.lane import MuseLane, lane_for
from app.tables import User

USER_HEADER = "X-User-Id"


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


def muse_lane(session: SessionDep, container: ContainerDep) -> MuseLane:
    return lane_for(container, session)


CurrentUser = Annotated[User, Depends(current_user)]
LaneDep = Annotated[MuseLane, Depends(muse_lane)]
