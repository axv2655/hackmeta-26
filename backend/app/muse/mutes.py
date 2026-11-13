"""Muted crews (F31): crews the owner asked Muse to stop suggesting.

A mute is keyed by member set, not by pseudo-group id, so it survives a
pseudo-group refresh (rows are recomputed and may get new ids). The key is
the sorted member ids joined by ",", **owner excluded** (the same convention
as `PseudoGroup.member_ids`). Any owner id passed in is dropped.

Readers: the revive agent skips muted crews and the flare agent leaves their
members out of the invite crew.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from sqlmodel import Session, select

from app.tables import MuseMute


def members_key(ids: Iterable[str], owner_id: str | None = None) -> str:
    """Sorted, de-duplicated member ids joined by ",", owner excluded."""
    return ",".join(sorted({i for i in ids if i and i != owner_id}))


def muted_keys(session: Session, owner_id: str) -> set[str]:
    rows = session.exec(select(MuseMute).where(MuseMute.owner_id == owner_id)).all()
    return {r.members_key for r in rows}


def is_muted(session: Session, owner_id: str, member_ids: Iterable[str]) -> bool:
    key = members_key(member_ids, owner_id)
    return bool(key) and session.get(MuseMute, (owner_id, key)) is not None


def mute(
    session: Session, owner_id: str, member_ids: Iterable[str], now: datetime
) -> str:
    """Mute a crew (idempotent). Commits. Returns the members key."""
    key = members_key(member_ids, owner_id)
    if key and session.get(MuseMute, (owner_id, key)) is None:
        session.add(MuseMute(owner_id=owner_id, members_key=key, created_at=now))
        session.commit()
    return key


def unmute(session: Session, owner_id: str, member_ids: Iterable[str]) -> None:
    """Unmute a crew (idempotent). Commits."""
    key = members_key(member_ids, owner_id)
    row = session.get(MuseMute, (owner_id, key)) if key else None
    if row is not None:
        session.delete(row)
        session.commit()
