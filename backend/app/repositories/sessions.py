"""Login session tokens (ARCHITECTURE.md 3.1).

    issue    a fresh token for a user at login or signup; returned once, only
             its SHA-256 is stored. A user may hold several (one per device).
    resolve  the user a token belongs to, or None.

The token is what proves who a request is from; `core/session_auth.py` turns
it into the `X-User-Id` every route already reads.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable

from sqlalchemy import Engine
from sqlmodel import Session

from app.domain.mcp_tokens import hash_token
from app.ports import Clock
from app.tables import AuthSession, User

SESSION_PREFIX = "mvsess_"


def new_session_token() -> str:
    return SESSION_PREFIX + secrets.token_urlsafe(32)


class SessionStore:
    def __init__(self, session: Session, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    def issue(self, user_id: str) -> str:
        token = new_session_token()
        self.session.add(
            AuthSession(
                token_hash=hash_token(token),
                user_id=user_id,
                created_at=self.clock.now(),
            )
        )
        self.session.commit()
        return token

    def resolve(self, token: str) -> str | None:
        if not token.startswith(SESSION_PREFIX):
            return None
        record = self.session.get(AuthSession, hash_token(token))
        if record is None or self.session.get(User, record.user_id) is None:
            return None
        return record.user_id


def session_resolver(engine: Engine, clock: Clock) -> Callable[[str], str | None]:
    """`resolve` with its own short session, for the auth middleware."""

    def resolve(token: str) -> str | None:
        with Session(engine) as session:
            return SessionStore(session, clock).resolve(token)

    return resolve
