"""Remote MCP server: lets Muse (Meta AI) call Moves.

Streamable HTTP, stateless, JSON responses, served by this FastAPI app at
`POST /mcp`. Auth is a per-user token sent as `Authorization: Bearer <token>`
or `X-API-Key: <token>`; anything else is 401. Every tool call acts as the
token's owner, so two people's connectors never share an identity.

Each user has one token, from `POST /api/v1/mcp/tokens` (username and
password); minting again replaces it. Only its SHA-256 is stored
(`repositories/mcp_tokens.py`). There is no shared env token. Tokens are never
logged.

The tools themselves live in `app/services/mcp_tools.py`; this module is only
transport, auth and the tool descriptions the model reads.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

import anyio
from fastapi import FastAPI
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import Field
from sqlalchemy import Engine
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from app.container import Container
from app.core import db
from app.repositories.glasses_places import DEFAULT_DEMO_MARK_ID, SqlPlaceFinder
from app.repositories.mcp_people import SqlPeopleDirectory
from app.repositories.mcp_tokens import token_resolver
from app.services import glasses
from app.services.mcp_tools import IdempotencyCache, MovesTools, bounded

MCP_PATH = "/mcp"
# Where the auth gate leaves the caller's user id in the ASGI scope.
USER_SCOPE_KEY = "moves.mcp_user_id"
DEMO_MARK_ENV = "GLASSES_DEMO_MARK_ID"


type ToolsFactory = Callable[[FastAPI, str], MovesTools]
type TokenResolver = Callable[[str], str | None]

_idempotency = IdempotencyCache()


class BearerAuth:
    """Pure ASGI gate: a request reaches the MCP app only with a token that
    names a user, and carries that user's id in its scope."""

    def __init__(self, app: ASGIApp, host: FastAPI) -> None:
        self.app = app
        self.host = host

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        user_id = await self._user_for(_offered(scope))
        if user_id is not None:
            await self.app({**scope, USER_SCOPE_KEY: user_id}, receive, send)
            return
        reply = JSONResponse(
            {"error": "unauthorized"},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
        await reply(scope, receive, send)

    async def _user_for(self, offered: list[bytes]) -> str | None:
        resolve: TokenResolver = self.host.state.mcp_resolve_token
        for token in offered:
            user_id = await anyio.to_thread.run_sync(resolve, token.decode())
            if user_id:
                return user_id
        return None


def _offered(scope: Scope) -> list[bytes]:
    """The candidate tokens: a Bearer credential and/or an X-API-Key."""
    headers = {k.lower(): v for k, v in scope.get("headers", [])}
    offered: list[bytes] = []
    scheme, _, token = headers.get(b"authorization", b"").partition(b" ")
    if scheme.lower() == b"bearer" and token.strip():
        offered.append(token.strip())
    if key := headers.get(b"x-api-key", b"").strip():
        offered.append(key)
    return offered


def tools_for(container: Container, user_id: str, engine: Engine) -> MovesTools:
    """The Moves tools acting as `user_id` (MCP uses the token's owner; Muse
    search in the app uses the signed-in user)."""
    places = SqlPlaceFinder(
        engine, os.environ.get(DEMO_MARK_ENV) or DEFAULT_DEMO_MARK_ID
    )
    return MovesTools(
        container=container,
        user_id=user_id,
        people=SqlPeopleDirectory(engine, container.clock, container.notifier),
        glasses_service=glasses.service_for(container),
        place_by_name=lambda name: places.named_in(name, fuzzy=True),
        idempotency=_idempotency,
    )


def default_tools(app: FastAPI, user_id: str) -> MovesTools:
    return tools_for(app.state.container, user_id, db.engine)


def caller_id(ctx: Context) -> str:
    """The user the auth gate resolved for this request."""
    request = ctx.request_context.request
    user_id = request.scope.get(USER_SCOPE_KEY) if request is not None else None
    if not user_id:
        raise PermissionError("no authenticated Moves user on this request")
    return user_id


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


def build_server(tools: Callable[[Context], MovesTools]) -> FastMCP:
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
            "again. Only set `place` if the user named a venue. Never pass a city "
            "or location; Moves uses the user's phone location. Coordinates you "
            "send are ignored. With no named venue the Move goes to the seeded "
            "place nearest the user's phone, else their usual spot; if none "
            "matches you get status 'needs_place' with a question to ask. Read "
            "`spoken` to the user and wait for their answer."
        )
    )
    async def draft_move(
        text: Annotated[str, Field(min_length=1, max_length=300)],
        to: list[str] | None = None,
        place: str | None = None,
        lat: Lat = None,
        lng: Lng = None,
        ctx: Context = None,  # type: ignore[assignment]
    ) -> dict[str, Any]:
        return await bounded(tools(ctx).draft_move(text, to, place, lat, lng))  # type: ignore[return-value]

    @server.tool(
        description=(
            "POST the drafted Move so friends see it. Only call this AFTER the user "
            "has explicitly confirmed the draft you read them (for example said "
            "'yes' or 'confirm'); never call it on your own. Safe to retry with the "
            "same request_id: it posts at most once. If it returns status "
            "'expired', redo draft_move and ask the user again."
        )
    )
    async def confirm_move(
        draft_id: str, request_id: RequestId, ctx: Context
    ) -> dict[str, Any]:
        return await bounded(tools(ctx).confirm_move(draft_id, request_id))  # type: ignore[return-value]

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
        move_id: str, to: list[str], request_id: RequestId, ctx: Context
    ) -> dict[str, Any]:
        return await bounded(tools(ctx).share_move(move_id, to, request_id))  # type: ignore[return-value]

    @server.tool(
        description=(
            "Mark the user as going to a live Move they can see ('pull up'). Only "
            "call when the user said they are coming. Idempotent per request_id; "
            "calling again for a Move they already joined just reports "
            "'already_going'."
        )
    )
    async def pull_up(
        move_id: str, request_id: RequestId, ctx: Context
    ) -> dict[str, Any]:
        return await bounded(tools(ctx).pull_up(move_id, request_id))  # type: ignore[return-value]

    @server.tool(
        description=(
            "Which friends are with the user right now, as a count, first names and "
            "a place name. Only friends who turned on nearby sharing appear. Never "
            "exact positions. Read-only."
        )
    )
    async def friends_nearby(ctx: Context) -> dict[str, Any]:
        return tools(ctx).friends_nearby()

    @server.tool(
        description=(
            "The Move the user is in right now, or active=false. Read-only. Call "
            "this before retrying a write that timed out or failed, to see whether "
            "it already happened."
        )
    )
    async def get_my_active_move(ctx: Context) -> dict[str, Any]:
        return tools(ctx).get_my_active_move()

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
    def current(ctx: Context) -> MovesTools:
        return app.state.mcp_tools_factory(app, caller_id(ctx))

    server = build_server(current)
    app.state.mcp_server = server
    app.state.mcp_asgi = server.streamable_http_app()
    return server


def mount_mcp(app: FastAPI, factory: ToolsFactory = default_tools) -> FastMCP:
    """Serve MCP at `/mcp` on `app`. `app.state.mcp_tools_factory` and
    `app.state.mcp_resolve_token` may be replaced later (tests inject fakes)."""
    app.state.mcp_tools_factory = factory
    server = _fresh_server(app)
    app.router.routes.append(Route(MCP_PATH, BearerAuth(_Current(app), app)))
    return server


@asynccontextmanager
async def mcp_runtime(app: FastAPI) -> AsyncIterator[None]:
    """Start a fresh MCP session manager for this startup of the app."""
    if not hasattr(app.state, "mcp_tools_factory"):
        yield
        return
    if not hasattr(app.state, "mcp_resolve_token"):
        app.state.mcp_resolve_token = token_resolver(
            db.engine, app.state.container.clock
        )
    server = _fresh_server(app)
    async with server.session_manager.run():
        yield
