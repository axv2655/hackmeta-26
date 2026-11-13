"""Issue, list, revoke and resolve per-user MCP tokens (ARCHITECTURE.md 11.4).

issue    the user's token: one per user, so this replaces any earlier
         one. The plain token is returned once; only its hash is stored.
list     a user's tokens (hint, label, dates), never the token itself.
revoke   deletes one of the user's own tokens; `/mcp` rejects it at once.
resolve  the user a presented token belongs to, or None. Stamps
         `last_used_at` so owners can spot a token they no longer use.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.domain.mcp_tokens import (
    McpTokenNotFound,
    clean_label,
    hash_token,
    new_token,
    token_hint,
)
from app.ports import Clock
from app.tables import McpToken, User, new_id


@dataclass(frozen=True)
class IssuedToken:
    token: str  # the plain token: shown to the owner once, never stored
    record: McpToken


class McpTokenService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    def issue(self, user_id: str, label: str | None = None) -> IssuedToken:
        for old in self.list(user_id):
            self.session.delete(old)
        token = new_token()
        record = McpToken(
            id=f"mt_{new_id()}",
            user_id=user_id,
            token_hash=hash_token(token),
            hint=token_hint(token),
            label=clean_label(label),
            created_at=self.clock.now(),
        )
        self.session.add(record)
        self.session.commit()
        self.session.refresh(record)
        return IssuedToken(token=token, record=record)

    def list(self, user_id: str) -> list[McpToken]:
        query = (
            select(McpToken)
            .where(McpToken.user_id == user_id)
            .order_by(col(McpToken.created_at).desc())
        )
        return list(self.session.exec(query).all())

    def revoke(self, user_id: str, token_id: str) -> None:
        record = self.session.get(McpToken, token_id)
        # Someone else's token looks exactly like a missing one.
        if record is None or record.user_id != user_id:
            raise McpTokenNotFound(token_id)
        self.session.delete(record)
        self.session.commit()

    def resolve(self, token: str) -> str | None:
        if not token:
            return None
        query = select(McpToken).where(McpToken.token_hash == hash_token(token))
        record = self.session.exec(query).first()
        if record is None or self.session.get(User, record.user_id) is None:
            return None
        record.last_used_at = self.clock.now()
        self.session.add(record)
        self.session.commit()
        return record.user_id


def token_resolver(engine: Engine, clock: Clock) -> Callable[[str], str | None]:
    """`resolve` with its own short session, for the `/mcp` auth gate."""

    def resolve(token: str) -> str | None:
        with Session(engine) as session:
            return McpTokenService(session, clock).resolve(token)

    return resolve
