"""Per-user tokens for the Meta AI connector at `/mcp` (ARCHITECTURE.md 11.4).

POST   /mcp/tokens              {username, password, label?} -> the token, once
GET    /mcp/tokens              the signed-in user's tokens (hints, no secrets)
DELETE /mcp/tokens/{token_id}   revoke one of the signed-in user's tokens

Minting asks for the password, not `X-User-Id`: the header is mock auth that
anyone can set, and a token is a lasting credential that acts as its owner.
Listing and revoking are low-risk, so they use the usual `X-User-Id`.
"""

from datetime import datetime

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from app.api.deps import ContainerDep
from app.api.deps_core import CurrentUserDep
from app.core.db import SessionDep
from app.repositories.mcp_tokens import McpTokenService
from app.services.accounts import AccountService
from app.tables import McpToken

router = APIRouter(tags=["mcp"])


class IssueTokenIn(BaseModel):
    username: str
    password: str
    label: str | None = Field(default=None, max_length=60)


class McpTokenOut(BaseModel):
    id: str
    label: str
    hint: str
    created_at: datetime
    last_used_at: datetime | None

    @classmethod
    def of(cls, record: McpToken) -> "McpTokenOut":
        return cls.model_validate(record, from_attributes=True)


class IssuedTokenOut(McpTokenOut):
    user_id: str
    token: str  # shown once; send as "Authorization: Bearer <token>" to /mcp


@router.post("/mcp/tokens", status_code=status.HTTP_201_CREATED)
def issue_token(
    body: IssueTokenIn, session: SessionDep, container: ContainerDep
) -> IssuedTokenOut:
    user, _ = AccountService(session, container.clock).login(
        body.username, body.password
    )
    issued = McpTokenService(session, container.clock).issue(user.id, body.label)
    return IssuedTokenOut(
        **McpTokenOut.of(issued.record).model_dump(),
        user_id=user.id,
        token=issued.token,
    )


@router.get("/mcp/tokens")
def list_tokens(
    me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> list[McpTokenOut]:
    service = McpTokenService(session, container.clock)
    return [McpTokenOut.of(r) for r in service.list(me.id)]


@router.delete("/mcp/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(
    token_id: str, me: CurrentUserDep, session: SessionDep, container: ContainerDep
) -> Response:
    McpTokenService(session, container.clock).revoke(me.id, token_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
