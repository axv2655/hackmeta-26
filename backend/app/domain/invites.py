"""Pure rules for sharing a Move with people outside the app (ARCHITECTURE.md 9.4).

Standard library only. The service decides who may share; this module shapes
message copy, tokens and URLs.
"""

from __future__ import annotations

import secrets

MAX_INVITES_PER_MOVE = 40
MAX_MESSAGE_CHARS = 300
MAX_NAME_CHARS = 40
TOKEN_BYTES = 9  # 12 url-safe characters


class InviteError(Exception):
    """Base for invite errors; the route maps each kind to a status."""


class InvalidInvite(InviteError):
    """Bad input: an empty guest name, a message that is too long."""


class InviteNotAllowed(InviteError):
    """The caller cannot see the Move, so cannot share it."""


class InviteMoveGone(InviteError):
    """The Move does not exist or is no longer live."""


class InviteNotFound(InviteError):
    """No invite has this token."""


def clean_name(raw: str | None) -> str:
    """A first name for display: trimmed, single-spaced, capped."""
    name = " ".join((raw or "").split())
    return name[:MAX_NAME_CHARS]


def invite_text(inviter_first: str, mark_name: str, creator_first: str = "") -> str:
    """ "Anish is making a move to Kumo Matcha. You want to pull up?" When Anish
    shares Tony's Move: "Anish: Tony is making a move to Kumo Matcha. You want
    to pull up?" The client may send its own line (Muse's) instead."""
    host = creator_first or inviter_first
    line = f"{host} is making a move to {mark_name}. You want to pull up?"
    return line if host == inviter_first else f"{inviter_first}: {line}"


def clean_message(custom: str | None, fallback: str) -> str:
    text = " ".join((custom or "").split())
    if not text:
        return fallback
    if len(text) > MAX_MESSAGE_CHARS:
        raise InvalidInvite(f"Message is over {MAX_MESSAGE_CHARS} characters")
    return text


def share_body(text: str, url: str) -> str:
    """What the share sheet sends. The link goes last so iMessage shows it as
    its own bubble with a preview card: the line, then the link."""
    return f"{text}\n{url}"


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def invite_url(base_url: str, token: str) -> str:
    return f"{base_url.rstrip('/')}/m/{token}"


def check_invite_count(already_shared: int) -> None:
    if already_shared >= MAX_INVITES_PER_MOVE:
        raise InvalidInvite("This Move has been shared too many times")
