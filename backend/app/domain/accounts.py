"""Account rules: usernames, passwords and their hashes. Stdlib only."""

from __future__ import annotations

import hashlib
import hmac
import os
import re

from app.domain.errors import Conflict, Forbidden, Invalid

# Every seeded demo person can log in with their first name and this password.
SEED_PASSWORD = "moves"

NAME_MAX = 60

_USERNAME = re.compile(r"^[a-z0-9_.]{3,24}$")
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


class UsernameTaken(Conflict):
    def __init__(self, username: str) -> None:
        super().__init__(f"@{username} is taken")


class BadLogin(Forbidden):
    def __init__(self) -> None:
        super().__init__("Wrong username or password")


class BadSignup(Invalid):
    pass


class BadName(Invalid):
    pass


def clean_display_name(raw: str) -> str:
    """A trimmed display name of 1 to `NAME_MAX` characters."""
    name = " ".join(raw.split())
    if not name:
        raise BadName("Add your name")
    if len(name) > NAME_MAX:
        raise BadName(f"Names are at most {NAME_MAX} characters")
    return name


def first_word(name: str) -> str:
    return name.split()[0]


def normalize_username(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def check_signup(name: str, username: str, password: str) -> None:
    if not name.strip():
        raise BadSignup("Add your name")
    if not _USERNAME.match(username):
        raise BadSignup("Usernames are 3 to 24 letters, numbers, dots or underscores")
    if len(password) < 4:
        raise BadSignup("Passwords need at least 4 characters")


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
    return hmac.compare_digest(actual.hex(), digest)
