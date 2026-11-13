"""Phone push registration.

POST   /me/push-tokens           {token, sandbox}: this phone's APNs token
DELETE /me/push-tokens/{token}   on logout, so the next person isn't pushed
"""

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.services.push import PushTokens

router = APIRouter(tags=["push"])


class PushTokenIn(BaseModel):
    token: str = Field(min_length=32, max_length=200, pattern=r"^[0-9a-fA-F]+$")
    sandbox: bool = True


@router.post("/me/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(
    body: PushTokenIn,
    user: CurrentUserDep,
    session: SessionDep,
    container: ContainerDep,
) -> None:
    PushTokens(session, container.clock).register(user.id, body.token, body.sandbox)


@router.delete("/me/push-tokens/{token}", status_code=status.HTTP_204_NO_CONTENT)
def unregister_push_token(
    token: str, user: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> None:
    PushTokens(session, container.clock).unregister(user.id, token)
