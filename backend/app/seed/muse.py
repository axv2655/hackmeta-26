"""Seed step owned by the muse lane (M9). Runs last, after history.

Detects pseudo-groups over the seeded hangouts (fallback labels, no Muse
call) and writes Anish's taste profile, so the revive card and the taste
line exist on first load. Writes only muse tables.
"""

from sqlmodel import Session, select

from app.muse.pseudo_groups import seed_all
from app.ports import Clock
from app.seed import ids
from app.tables import TasteProfile, User

ANISH_TASTE = TasteProfile(
    subject_type="user",
    subject_id=ids.ANISH,
    summary="likes quiet aesthetic coffee shops, not chains",
    likes=["quiet aesthetic coffee shops", "matcha", "places with seating"],
    dislikes=["chains"],
)


def seed(session: Session, clock: Clock) -> None:
    owners = list(session.exec(select(User.id)).all())
    seed_all(session, clock, owners)
    if session.get(User, ids.ANISH) is not None:
        session.add(
            TasteProfile.model_validate(
                {**ANISH_TASTE.model_dump(exclude={"id"}), "updated_at": clock.now()}
            )
        )
    session.flush()
