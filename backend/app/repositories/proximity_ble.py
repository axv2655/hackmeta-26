"""Real BLE proximity (ARCHITECTURE.md 8.2, 8.3): rotating tokens and sightings.

    issue   a fresh 12-byte token for an opted-in user, valid 15 minutes. The
            phone advertises it inside a 128-bit service UUID
            (`4D4F5645-....`, "MOVE" + the token), so no user id is broadcast.
    ingest  what a phone saw: resolve each token, drop weak signals, store the
            raw sighting, and refresh co-presence for friend pairs. Returns
            the users who just became co-present, so the caller sweeps once.

Only the server can resolve a token. Strangers are never paired (8.4).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, select

from app.domain.errors import Forbidden
from app.ports import Clock
from app.services.proximity import (
    COPRESENCE_WINDOW,
    TOKEN_TTL,
    keep_sighting,
    pair_key,
)
from app.services.proximity_sweep import friends_of
from app.tables import Copresence, ProximitySighting, ProximityToken, UserSettings

UUID_PREFIX = "4d4f5645"  # "MOVE"
TOKEN_BYTES = 12  # 24 hex chars, the rest of the 128-bit UUID


class BleNotEnabled(Forbidden):
    def __init__(self) -> None:
        super().__init__("Turn on Bluetooth proximity in Settings first.")


@dataclass(frozen=True)
class IssuedBleToken:
    token: str
    uuid: str
    expires_at: datetime


def token_uuid(token: str) -> str:
    """`4d4f5645` + 24 hex token chars, dashed as a UUID."""
    h = UUID_PREFIX + token
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}".upper()


def token_from_uuid(value: str) -> str | None:
    h = value.replace("-", "").lower()
    if len(h) != 32 or not h.startswith(UUID_PREFIX):
        return None
    return h[len(UUID_PREFIX) :]


def ble_enabled(session: Session, user_id: str) -> bool:
    row = session.get(UserSettings, user_id)
    return bool(row and row.ble_opt_in)


def issue_token(session: Session, clock: Clock, user_id: str) -> IssuedBleToken:
    if not ble_enabled(session, user_id):
        raise BleNotEnabled()
    now = clock.now()
    expired = session.exec(
        select(ProximityToken).where(
            ProximityToken.user_id == user_id,
            col(ProximityToken.expires_at) < now,
        )
    ).all()
    for row in expired:
        session.delete(row)
    token = secrets.token_hex(TOKEN_BYTES)
    expires_at = now + TOKEN_TTL
    session.add(ProximityToken(token=token, user_id=user_id, expires_at=expires_at))
    session.commit()
    return IssuedBleToken(token=token, uuid=token_uuid(token), expires_at=expires_at)


def _resolve(session: Session, token: str, now: datetime) -> str | None:
    row = session.get(ProximityToken, token)
    if row is None or row.kind != "user" or row.expires_at <= now:
        return None
    return row.user_id


def _strongest(sightings: list[tuple[str, int]]) -> dict[str, int]:
    best: dict[str, int] = {}
    for raw, rssi in sightings:
        token = token_from_uuid(raw) if "-" in raw or len(raw) == 32 else raw.lower()
        if token and keep_sighting(rssi):
            best[token] = max(rssi, best.get(token, -999))
    return best


def ingest(
    session: Session, clock: Clock, observer_id: str, sightings: list[tuple[str, int]]
) -> list[str]:
    """Store sightings; return friends who just became co-present with the
    observer (were not co-present a moment ago)."""
    if not ble_enabled(session, observer_id):
        raise BleNotEnabled()
    now = clock.now()
    friends = friends_of(session, observer_id)
    fresh: list[str] = []
    for token, rssi in _strongest(sightings).items():
        observed = _resolve(session, token, now)
        if observed is None or observed == observer_id or observed not in friends:
            continue
        session.add(
            ProximitySighting(
                observer_id=observer_id,
                observed_id=observed,
                rssi=rssi,
                seen_at=now,
                source="ble",
            )
        )
        if _touch_pair(session, observer_id, observed, now):
            fresh.append(observed)
    session.commit()
    return fresh


def _touch_pair(session: Session, a: str, b: str, now: datetime) -> bool:
    """Refresh the pair's `last_seen`; True when it was not co-present before."""
    key = pair_key(a, b)
    row = session.get(Copresence, key)
    if row is None:
        session.add(
            Copresence(user_a=key[0], user_b=key[1], first_seen=now, last_seen=now)
        )
        return True
    was_fresh = row.last_seen >= now - COPRESENCE_WINDOW
    if row.last_seen < now:  # keep a longer demo hold
        row.last_seen = now
    if not was_fresh:
        row.first_seen = now
    session.add(row)
    return not was_fresh
