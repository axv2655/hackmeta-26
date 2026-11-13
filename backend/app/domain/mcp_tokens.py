"""Per-user MCP tokens (ARCHITECTURE.md 11.4): rules only, stdlib only.

A token is a long random string shown to its owner once. The database keeps
only its SHA-256, so a leaked database cannot be replayed against `/mcp`. A
plain hash (not scrypt) is enough because tokens carry ~256 bits of entropy,
and it lets `/mcp` find the owner with one indexed lookup.
"""

from __future__ import annotations

import hashlib
import secrets

from app.domain.errors import Invalid, NotFound

PREFIX = "mvs_"
MAX_LABEL = 60
DEFAULT_LABEL = "Meta AI"


class McpTokenNotFound(NotFound):
    def __init__(self, token_id: str) -> None:
        super().__init__(f"MCP token {token_id} not found")
        self.token_id = token_id


class BadTokenLabel(Invalid):
    def __init__(self) -> None:
        super().__init__(f"Token label must be at most {MAX_LABEL} characters")


def new_token() -> str:
    return PREFIX + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_hint(token: str) -> str:
    """Enough to tell tokens apart in a list, never enough to use one."""
    return f"{PREFIX}…{token[-4:]}"


def clean_label(label: str | None) -> str:
    label = (label or "").strip() or DEFAULT_LABEL
    if len(label) > MAX_LABEL:
        raise BadTokenLabel()
    return label
