"""Remote MCP server: lets Muse (Meta AI) call Moves.

Streamable HTTP, stateless, JSON responses, served by this FastAPI app at
`POST /mcp`. Auth is a shared secret: `Authorization: Bearer $MCP_TOKEN` or
`X-API-Key: $MCP_TOKEN`, compared in constant time, 401 otherwise. The token is
never logged. Every call acts as the single demo user `MCP_USER_ID`.

The tools themselves live in `app/services/mcp_tools.py`; this module is only
transport, auth and the tool descriptions the model reads.
"""

from __future__ import annotations

import hmac
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from app.container import Container
from app.core import db
from app.core.config import BACKEND_DIR
from app.repositories.glasses_places import DEFAULT_DEMO_MARK_ID, SqlPlaceFinder
from app.repositories.mcp_people import SqlPeopleDirectory
from app.services import glasses
from app.services.mcp_tools import IdempotencyCache, MovesTools, bounded

MCP_PATH = "/mcp"
DEMO_MARK_ENV = "GLASSES_DEMO_MARK_ID"


class McpSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_ignore_empty=True, extra="ignore"
    )

    # Unset: every request is rejected, so a forgotten token never means "open".
    MCP_TOKEN: SecretStr | None = None
    MCP_USER_ID: str = "u_anish"


mcp_settings = McpSettings()

type ToolsFactory = Callable[[FastAPI], MovesTools]

_idempotency = IdempotencyCache()


class BearerAuth:
    """Pure ASGI gate: only requests carrying `MCP_TOKEN` reach the MCP app."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self._allowed(scope):
            await self.app(scope, receive, send)
            return
        reply = JSONResponse(
            {"error": "unauthorized"},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
        await reply(scope, receive, send)

    @staticmethod
    def _allowed(scope: Scope) -> bool:
        secret = mcp_settings.MCP_TOKEN
        if secret is None or not secret.get_secret_value():
            return False
        expected = secret.get_secret_value().encode()
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        offered: list[bytes] = []
        auth = headers.get(b"authorization", b"")
        scheme, _, token = auth.partition(b" ")
        if scheme.lower() == b"bearer" and token:
            offered.append(token.strip())
        if key := headers.get(b"x-api-key"):
            offered.append(key.strip())
        # Compare every candidate so timing does not reveal which one matched.
        return any([hmac.compare_digest(c, expected) for c in offered])


def tools_for(container: Container, user_id: str, engine: Engine) -> MovesTools:
    """The Moves tools acting as `user_id` (MCP uses `MCP_USER_ID`; Muse
    search in the app uses the signed-in user)."""
    places = SqlPlaceFinder(
        engine, os.environ.get(DEMO_MARK_ENV) or DEFAULT_DEMO_MARK_ID
    )
    return MovesTools(
        container=container,
        user_id=user_id,
        people=SqlPeopleDirectory(engine, container.clock, container.notifier),
        glasses_service=glasses.service_for(container),
        place_by_name=places.named_in,
        idempotency=_idempotency,
    )


def default_tools(app: FastAPI) -> MovesTools:
    return tools_for(app.state.container, mcp_settings.MCP_USER_ID, db.engine)


Lat = Annotated[float | None, Field(ge=-90, le=90)]
Lng = Annotated[float | None, Field(ge=-180, le=180)]
RequestId = Annotated[
    str,
    Field(
        min_length=1,
        max_length=100,
        description="A unique id you make up for this attempt (a UUID). Reuse the "
        "same id when retrying so the action happens only once.",
    ),
]


def build_server(tools: Callable[[], MovesTools]) -> FastMCP:
    server = FastMCP(
        "Moves",
        instructions=(
            "Moves lets the user tell friends what they are doing right now "
            "(a Move) and lets friends pull up. Draft first, read the draft to the "
            "user, and only post after they explicitly say yes."
        ),
        stateless_http=True,
        json_response=True,
        streamable_http_path=MCP_PATH,
        # The shared secret is the gate; Host checks would reject tunnel hostnames.
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        ),
    )

    @server.tool(
        description=(
            "Prepare a Move (a post saying what the user is doing now, e.g. "
            "'getting boba') for the user to approve. Writes NOTHING and notifies "
            "no one. Returns draft_id, the place, the people who would see it, "
            "and the nudges Muse would send. `to` is friends' names or @usernames; "
            "if a name matches several friends or isn't a friend you get a "
            "clarifying question back instead of a draft: ask the user, then call "
            "again. `place` is a place name on the map; omit it to use "
            "coordinates, the user's usual spot, or ask where. Read `spoken` to the "
            "user and wait for their answer."
        )
    )
    async def draft_move(
        text: Annotated[str, Field(min_length=1, max_length=300)],
        to: list[str] | None = None,
        place: str | None = None,
        lat: Lat = None,
        lng: Lng = None,
    ) -> dict[str, Any]:
        return await bounded(tools().draft_move(text, to, place, lat, lng))  # type: ignore[return-value]

    @server.tool(
        description=(
            "POST the drafted Move so friends see it. Only call this AFTER the user "
            "has explicitly confirmed the draft you read them (for example said "
            "'yes' or 'confirm'); never call it on your own. Safe to retry with the "
            "same request_id: it posts at most once. If it returns status "
            "'expired', redo draft_move and ask the user again."
        )
    )
    async def confirm_move(draft_id: str, request_id: RequestId) -> dict[str, Any]:
        return await bounded(tools().confirm_move(draft_id, request_id))  # type: ignore[return-value]

    @server.tool(
        description=(
            "Nudge friends about a live Move the user is part of. They must "
            "already be able to see it (a Move's audience is fixed when posted); "
            "others are listed under `skipped`. Friends only; ambiguous or "
            "non-friend names come back as questions. Idempotent per request_id. "
            "Only call when the user asked to share it."
        )
    )
    async def share_move(
        move_id: str, to: list[str], request_id: RequestId
    ) -> dict[str, Any]:
        return await bounded(tools().share_move(move_id, to, request_id))  # type: ignore[return-value]

    @server.tool(
        description=(
            "Mark the user as going to a live Move they can see ('pull up'). Only "
            "call when the user said they are coming. Idempotent per request_id; "
            "calling again for a Move they already joined just reports "
            "'already_going'."
        )
    )
    async def pull_up(move_id: str, request_id: RequestId) -> dict[str, Any]:
        return await bounded(tools().pull_up(move_id, request_id))  # type: ignore[return-value]

    @server.tool(
        description=(
            "Which friends are with the user right now, as a count, first names and "
            "a place name. Only friends who turned on nearby sharing appear. Never "
            "exact positions. Read-only."
        )
    )
    async def friends_nearby() -> dict[str, Any]:
        return tools().friends_nearby()

    @server.tool(
        description=(
            "The Move the user is in right now, or active=false. Read-only. Call "
            "this before retrying a write that timed out or failed, to see whether "
            "it already happened."
        )
    )
    async def get_my_active_move() -> dict[str, Any]:
        return tools().get_my_active_move()

    return server


class _Current:
    """Forwards to the app's current MCP ASGI app. The SDK's session manager can
    run only once per instance, so each app startup builds a fresh server and
    this indirection keeps the route pointing at it."""

    def __init__(self, app: FastAPI) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app.state.mcp_asgi(scope, receive, send)


def _fresh_server(app: FastAPI) -> FastMCP:
    def current() -> MovesTools:
        return app.state.mcp_tools_factory(app)

    server = build_server(current)
    app.state.mcp_server = server
    app.state.mcp_asgi = server.streamable_http_app()
    return server


def mount_mcp(app: FastAPI, factory: ToolsFactory = default_tools) -> FastMCP:
    """Serve MCP at `/mcp` on `app`. `app.state.mcp_tools_factory` may replace
    the tool source later (tests inject fakes there)."""
    app.state.mcp_tools_factory = factory
    server = _fresh_server(app)
    app.router.routes.append(Route(MCP_PATH, BearerAuth(_Current(app))))
    return server


@asynccontextmanager
async def mcp_runtime(app: FastAPI) -> AsyncIterator[None]:
    """Start a fresh MCP session manager for this startup of the app."""
    if not hasattr(app.state, "mcp_tools_factory"):
        yield
        return
    server = _fresh_server(app)
    async with server.session_manager.run():
        yield
