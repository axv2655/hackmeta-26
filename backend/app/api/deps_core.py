"""FastAPI dependencies shared by the core lane's routes.

Auth is the mocked "Continue with Facebook" picker (ARCHITECTURE.md 3.1, 6):
the client picks a seeded user from `GET /auth/users` and sends its id as
`X-User-Id` on every request. `CurrentUserDep` resolves that header, and
answers 401 when it is missing or names no user.

`CoreRoute` maps the people services' errors to statuses; pass it as
`APIRouter(route_class=CoreRoute)` so handlers stay free of try/except.
"""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.api.deps import ContainerDep
from app.core.db import SessionDep
from app.services.circles import CircleService
from app.services.users import (
    ForbiddenError,
    InvalidRequest,
    NotFoundError,
    UserError,
    UserService,
)
from app.tables import User

USER_HEADER = "X-User-Id"

ERROR_STATUS: tuple[tuple[type[UserError], int], ...] = (
    (NotFoundError, status.HTTP_404_NOT_FOUND),
    (ForbiddenError, status.HTTP_403_FORBIDDEN),
    (InvalidRequest, status.HTTP_422_UNPROCESSABLE_CONTENT),
)


def get_user_service(session: SessionDep, container: ContainerDep) -> UserService:
    return UserService(session, container.clock)


def get_circle_service(session: SessionDep) -> CircleService:
    return CircleService(session)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CircleServiceDep = Annotated[CircleService, Depends(get_circle_service)]


def get_current_user(
    session: SessionDep,
    x_user_id: Annotated[str | None, Header(alias=USER_HEADER)] = None,
) -> User:
    if not x_user_id:
        raise _unauthorized(f"Missing {USER_HEADER} header")
    user = session.get(User, x_user_id)
    if user is None:
        raise _unauthorized(f"Unknown user {x_user_id!r}")
    return user


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": USER_HEADER},
    )


CurrentUserDep = Annotated[User, Depends(get_current_user)]


class CoreRoute(APIRoute):
    """Turns a `UserError` raised by a handler or dependency into `{detail}`."""

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
                return await handler(request)
            except UserError as exc:
                code = next(
                    (c for kind, c in ERROR_STATUS if isinstance(exc, kind)),
                    status.HTTP_400_BAD_REQUEST,
                )
                return JSONResponse(status_code=code, content={"detail": str(exc)})

        return handle
