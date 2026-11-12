"""FastAPI dependencies shared by the core lane's routes.

Auth is the mocked "Continue with Facebook" picker (ARCHITECTURE.md 3.1, 6):
the client picks a seeded user from `GET /auth/users` and sends its id as
`X-User-Id` on every request. `CurrentUserDep` resolves that header, and
answers 401 when it is missing or names no user. WebSockets cannot send
headers, so `/ws` passes `?user_id=` to `find_user` instead.

Service errors need no handling here: they are `app.domain.errors` kinds,
mapped to statuses once in `app/api/errors.py`.
"""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import ContainerDep
from app.core.composition import build_circle_service, build_user_service
from app.core.db import SessionDep
from app.services.circles import CircleService
from app.services.users import UserService
from app.tables import User

USER_HEADER = "X-User-Id"


def get_user_service(session: SessionDep, container: ContainerDep) -> UserService:
    return build_user_service(session, container.clock)


def get_circle_service(session: SessionDep) -> CircleService:
    return build_circle_service(session)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CircleServiceDep = Annotated[CircleService, Depends(get_circle_service)]


def find_user(session: Session, user_id: str | None) -> User | None:
    """The user a client claims to be, or None when the id is empty or unknown."""
    return session.get(User, user_id) if user_id else None


def get_current_user(
    session: SessionDep,
    x_user_id: Annotated[str | None, Header(alias=USER_HEADER)] = None,
) -> User:
    if not x_user_id:
        raise _unauthorized(f"Missing {USER_HEADER} header")
    user = find_user(session, x_user_id)
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
