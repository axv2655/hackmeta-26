"""Leaderboards (surfaces S7, ARCHITECTURE.md 13.2, plan A.6).

GET /leaderboards/spots?category&limit   you + friends, best combined first
GET /leaderboards/my-list?category       your own ranked list

`category` is optional (omitted = every category); an unknown value is 422.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.services.leaderboards import (
    DEFAULT_LIMIT,
    LeaderboardService,
    LeaderboardSpot,
    MyListRow,
)

router = APIRouter(tags=["leaderboards"])


def get_leaderboard_service(session: SessionDep) -> LeaderboardService:
    return LeaderboardService(session)


LeaderboardServiceDep = Annotated[LeaderboardService, Depends(get_leaderboard_service)]


@router.get("/leaderboards/spots", response_model=list[LeaderboardSpot])
def leaderboard_spots(
    user: CurrentUserDep,
    service: LeaderboardServiceDep,
    category: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = DEFAULT_LIMIT,
) -> list[LeaderboardSpot]:
    return service.spots(user.id, category, limit)


@router.get("/leaderboards/my-list", response_model=list[MyListRow])
def leaderboard_my_list(
    user: CurrentUserDep, service: LeaderboardServiceDep, category: str | None = None
) -> list[MyListRow]:
    return service.my_list(user.id, category)
