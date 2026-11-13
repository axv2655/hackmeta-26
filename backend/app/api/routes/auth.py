"""Login (ARCHITECTURE.md 3.1, 6, 14.2).

GET  /auth/users    the seeded users (the mock "Continue with Facebook" list)
POST /auth/signup   make a real account: name, username, password
POST /auth/login    username and password

Every route here works without a current user. After logging in, the client
stores the returned user's id and sends it as `X-User-Id` from then on
(`app/api/deps_core.py`). Seeded people log in as their first name with the
password `moves`.
"""

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.api.deps import ContainerDep
from app.api.deps_core import UserServiceDep
from app.core.db import SessionDep
from app.models.users import UserLite
from app.repositories.sessions import SessionStore
from app.services.accounts import AccountService

router = APIRouter(tags=["auth"])


class SignupIn(BaseModel):
    name: str
    username: str
    password: str


class LoginIn(BaseModel):
    username: str
    password: str


class AccountOut(BaseModel):
    user: UserLite
    username: str
    # Send as "Authorization: Bearer <session_token>" on every request.
    session_token: str


@router.get("/auth/users")
def list_login_users(service: UserServiceDep) -> list[UserLite]:
    return [UserLite.model_validate(user) for user in service.list_users()]


@router.post("/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, session: SessionDep, container: ContainerDep) -> AccountOut:
    accounts = AccountService(session, container.clock)
    user, username = accounts.signup(body.name, body.username, body.password)
    token = SessionStore(session, container.clock).issue(user.id)
    return AccountOut(
        user=UserLite.model_validate(user), username=username, session_token=token
    )


@router.post("/auth/login")
def login(body: LoginIn, session: SessionDep, container: ContainerDep) -> AccountOut:
    user, username = AccountService(session, container.clock).login(
        body.username, body.password
    )
    token = SessionStore(session, container.clock).issue(user.id)
    return AccountOut(
        user=UserLite.model_validate(user), username=username, session_token=token
    )
