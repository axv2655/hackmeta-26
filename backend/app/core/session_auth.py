"""Session auth in front of every route (ARCHITECTURE.md 3.1).

Every route resolves its user from `X-User-Id` (the WebSocket from
`?user_id=`). This middleware makes that header trustworthy without touching
the routes:

  * `Authorization: Bearer mvsess_...` (WebSocket: `?token=mvsess_...`) is
    looked up; a valid token REPLACES any client-sent `X-User-Id` / `user_id`
    with the token's owner, and an unknown token is 401 (WebSocket: closed).
  * No session token: with `AUTH_REQUIRE_SESSION` on, a bare `X-User-Id` /
    `user_id` is stripped, so routes needing a user answer 401. Off (the
    default), the mock "pick a user" flow keeps working.

`/mcp` has its own per-user tokens and is left alone.
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import parse_qsl, urlencode

import anyio
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.clock import SystemClock
from app.core.config import settings
from app.repositories.sessions import SESSION_PREFIX, session_resolver

type Resolver = Callable[[str], str | None]

USER_HEADER = b"x-user-id"
SKIP_PREFIXES = ("/mcp",)


def _bearer(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name.lower() == b"authorization":
            scheme, _, token = value.decode("latin-1").partition(" ")
            token = token.strip()
            if scheme.lower() == "bearer" and token.startswith(SESSION_PREFIX):
                return token
    return None


def _with_user_header(scope: Scope, user_id: str | None) -> Scope:
    headers = [(k, v) for k, v in scope.get("headers", []) if k.lower() != USER_HEADER]
    if user_id:
        headers.append((USER_HEADER, user_id.encode()))
    return {**scope, "headers": headers}


def _with_user_query(scope: Scope, user_id: str | None) -> Scope:
    query = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
    kept = [(k, v) for k, v in query if k not in ("user_id", "token")]
    if user_id:
        kept.append(("user_id", user_id))
    return {**scope, "query_string": urlencode(kept).encode()}


def _ws_token(scope: Scope) -> str | None:
    query = dict(parse_qsl(scope.get("query_string", b"").decode()))
    token = query.get("token", "")
    return token if token.startswith(SESSION_PREFIX) else None


class SessionAuthMiddleware:
    def __init__(self, app: ASGIApp, resolver: Resolver | None = None) -> None:
        self.app = app
        self._resolver = resolver

    def resolver(self, scope: Scope) -> Resolver:
        app = scope.get("app")
        override = getattr(app.state, "session_resolver", None) if app else None
        if override is not None:
            return override
        if self._resolver is None:
            from app.core import db  # imported late: tests swap the engine

            self._resolver = session_resolver(db.engine, SystemClock())
        return self._resolver

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        kind = scope["type"]
        path = scope.get("path", "")
        if kind not in ("http", "websocket") or path.startswith(SKIP_PREFIXES):
            await self.app(scope, receive, send)
            return
        token = _bearer(scope) if kind == "http" else _ws_token(scope)
        rewrite = _with_user_header if kind == "http" else _with_user_query
        if token is None:
            if settings.AUTH_REQUIRE_SESSION:
                scope = rewrite(scope, None)
            await self.app(scope, receive, send)
            return
        user_id = await anyio.to_thread.run_sync(self.resolver(scope), token)
        if user_id is not None:
            await self.app(rewrite(scope, user_id), receive, send)
        elif kind == "websocket":
            await send({"type": "websocket.close", "code": 1008})
        else:
            reply = JSONResponse(
                {"detail": "Session expired. Log in again."}, status_code=401
            )
            await reply(scope, receive, send)
