"""Read-only place lookups for glasses, over core's tables (S9).

Used only when the sent coordinates and Muse gave no place. Reads `marks`,
`move_participants`, `moves` and `saved_marks`; writes nothing. The user's own
history only informs their own draft, and no coordinates are ever read back
from the user: the Mark's pin is a public place, not a person's position.
"""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core.composition import build_mark_service
from app.ports import Clock, MarkSnapshot
from app.seed import ids
from app.services.glasses import NewPlace, match_named, usual_mark_id
from app.services.marks import MarkInput
from app.tables import Mark, Move, MoveParticipant, SavedMark

DEFAULT_DEMO_MARK_ID = ids.KUMO_MATCHA


def _snapshot(row: Mark) -> MarkSnapshot:
    return MarkSnapshot(
        id=row.id,
        name=row.name,
        category=row.category,
        lat=row.lat,
        lng=row.lng,
        address=row.address,
        vibe_tags=tuple(row.vibe_tags),
        photo_url=row.photo_url,
        price_level=row.price_level,
        source=row.source,
    )


class SqlPlaceFinder:
    def __init__(
        self, engine: Engine, demo_mark_id: str = DEFAULT_DEMO_MARK_ID
    ) -> None:
        self._engine = engine
        self._demo_mark_id = demo_mark_id

    def named_in(self, text: str) -> MarkSnapshot | None:
        with Session(self._engine) as session:
            rows = session.exec(select(Mark.id, Mark.name)).all()
            found = match_named(text, ((r[0], r[1]) for r in rows))
            row = session.get(Mark, found) if found else None
            return _snapshot(row) if row else None

    def usual_for(self, user_id: str) -> MarkSnapshot | None:
        with Session(self._engine) as session:
            visits = session.exec(
                select(Move.mark_id, MoveParticipant.joined_at)
                .join(MoveParticipant, MoveParticipant.move_id == Move.id)
                .where(MoveParticipant.user_id == user_id)
            ).all()
            saved = session.exec(
                select(SavedMark.mark_id, SavedMark.saved_at).where(
                    SavedMark.user_id == user_id
                )
            ).all()
            found = usual_mark_id(
                ((r[0], r[1]) for r in visits), ((r[0], r[1]) for r in saved)
            )
            row = session.get(Mark, found) if found else None
            return _snapshot(row) if row else None

    def demo_mark(self) -> MarkSnapshot | None:
        with Session(self._engine) as session:
            row = session.get(Mark, self._demo_mark_id)
            return _snapshot(row) if row else None


class SqlPlaceCreator:
    """Creates a user Mark through core's own `MarkService.create` (same
    validation and `source="user"` as `POST /marks`). Core exposes no port for
    this yet, so it is a surfaces-side adapter; ask core for `MarkGateway.create`."""

    def __init__(self, engine: Engine, clock: Callable[[], Clock]) -> None:
        self._engine = engine
        self._clock = clock

    def create(self, user_id: str, place: NewPlace) -> MarkSnapshot:
        data = MarkInput(
            name=place.name, category=place.category, lat=place.lat, lng=place.lng
        )
        with Session(self._engine) as session:
            return build_mark_service(session, self._clock()).create(user_id, data).mark
