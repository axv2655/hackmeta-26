"""Seed step owned by the muse lane (M9). Runs last, after history.

Detects pseudo-groups over the seeded hangouts (fallback labels, no Muse
call) and writes Anish's taste profile, so the revive card and the taste
line exist on first load. Writes only muse tables. Idempotent: pseudo-groups
are matched by member set and the taste profile is updated in place.
"""

from collections.abc import Iterable

from sqlmodel import Session, select

from app.muse.pseudo_groups import seed_all
from app.ports import Clock
from app.seed import ids
from app.tables import TasteProfile, User

ANISH_SUMMARY = "likes quiet aesthetic coffee shops, not chains"
ANISH_LIKES = ("quiet aesthetic coffee shops", "matcha", "places with seating")
ANISH_DISLIKES = ("chains",)


def upsert_anish_taste(session: Session, clock: Clock) -> bool:
    """Write Anish's taste profile, updating it if one exists. False when
    Anish is not in the database."""
    if session.get(User, ids.ANISH) is None:
        return False
    row = session.exec(
        select(TasteProfile).where(
            TasteProfile.subject_type == "user", TasteProfile.subject_id == ids.ANISH
        )
    ).first() or TasteProfile(subject_type="user", subject_id=ids.ANISH)
    row.summary = ANISH_SUMMARY
    row.likes = list(ANISH_LIKES)
    row.dislikes = list(ANISH_DISLIKES)
    row.updated_at = clock.now()
    session.add(row)
    return True


def refresh_groups(session: Session, clock: Clock, owners: Iterable[str]) -> int:
    """Recompute pseudo-groups for `owners`; returns how many groups exist."""
    return seed_all(session, clock, list(owners))


def seed(session: Session, clock: Clock) -> None:
    owners = list(session.exec(select(User.id)).all())
    refresh_groups(session, clock, owners)
    upsert_anish_taste(session, clock)
    session.flush()
