"""Storage for Moves, their participants and audience (core C3).

`SqlMoveRepository` maps `moves`, `marks` and `move_participants` rows to
`MoveSnapshot`s and writes what `app.domain.moves` decided. It holds no
business rules: it never decides whether a change is allowed.

Visibility: every query that returns Moves for a viewer filters with
`repositories.audience.visible_to`, the SQL twin of `can_see`. The only reads
without a viewer are `get` (by id, for services that check `can_see`
themselves) and `live_ids_started_before`, which returns ids only, for the
stale job. There is no "list all Moves".

Writes are added and flushed but never committed; the service commits them in
one transaction (with the audience rows from `SqlAudienceRepository`).
"""

from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from typing import Protocol

from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from app.domain.errors import MarkNotFound
from app.domain.moves import NewMove
from app.domain.privacy import ResolvedAudience
from app.ports import (
    AudienceVia,
    MarkSnapshot,
    MoveSnapshot,
    MoveStatus,
    ParticipantSnapshot,
)
from app.repositories.audience import SqlAudienceRepository, visible_to
from app.tables import Mark, Move, MoveAudience, MoveParticipant

_MoveQuery = Select[tuple[Move, Mark]]


class MoveRepository(Protocol):
    """What the Move service needs from storage. Fake this in service tests."""

    def get(self, move_id: str) -> MoveSnapshot | None: ...

    def get_visible(self, move_id: str, viewer_id: str) -> MoveSnapshot | None: ...

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]: ...

    def live_ids_started_before(self, cutoff: datetime) -> list[str]: ...

    def participants(self, move_id: str) -> tuple[ParticipantSnapshot, ...]: ...

    def audience_ids(self, move_id: str) -> frozenset[str]: ...

    def create(self, new: NewMove, audience: ResolvedAudience) -> MoveSnapshot: ...

    def save_participant(self, move_id: str, p: ParticipantSnapshot) -> None: ...

    def add_audience(self, move_id: str, user_id: str, via: AudienceVia) -> None: ...

    def set_ended(
        self, move_id: str, status: MoveStatus, ends_at: datetime
    ) -> None: ...


def mark_snapshot(mark: Mark) -> MarkSnapshot:
    return MarkSnapshot(
        id=mark.id,
        name=mark.name,
        category=mark.category,
        lat=mark.lat,
        lng=mark.lng,
        address=mark.address,
        vibe_tags=tuple(mark.vibe_tags),
        photo_url=mark.photo_url,
        price_level=mark.price_level,
        source=mark.source,
    )


def participant_snapshot(row: MoveParticipant) -> ParticipantSnapshot:
    return ParticipantSnapshot(
        user_id=row.user_id,
        status=row.status,
        joined_via=row.joined_via,
        joined_at=row.joined_at,
        arrived_at=row.arrived_at,
        left_at=row.left_at,
    )


def move_snapshot(
    move: Move, mark: Mark, participants: Iterable[ParticipantSnapshot] = ()
) -> MoveSnapshot:
    return MoveSnapshot(
        id=move.id,
        creator_id=move.creator_id,
        mark=mark_snapshot(mark),
        text=move.text,
        category=move.category,
        status=move.status,
        kind=move.kind,
        open=move.open,
        origin=move.origin,
        starts_at=move.starts_at,
        created_at=move.created_at,
        participants=tuple(participants),
        origin_ref=move.origin_ref,
        fill_deadline=move.fill_deadline,
        ends_at=move.ends_at,
        notify_user_ids=(
            None if move.notify_user_ids is None else tuple(move.notify_user_ids)
        ),
    )


class SqlMoveRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- Reads ---------------------------------------------------------------

    def get(self, move_id: str) -> MoveSnapshot | None:
        """Any Move by id, with no visibility check. Services only: check
        `can_see` before showing the result to anyone."""
        return self._one(_moves().where(Move.id == move_id))

    def get_visible(self, move_id: str, viewer_id: str) -> MoveSnapshot | None:
        """The Move if `viewer_id` may see it (any status), else None."""
        return self._one(_moves().where(Move.id == move_id, visible_to(viewer_id)))

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        """Live Moves `viewer_id` may see, newest `starts_at` first."""
        return self._many(
            _moves()
            .where(Move.status == "live", visible_to(viewer_id))
            .order_by(col(Move.starts_at).desc(), col(Move.id))
        )

    def live_ids_started_before(self, cutoff: datetime) -> list[str]:
        """Ids of live Moves with `starts_at <= cutoff`, oldest first: the
        stale-job candidates (pass `domain.moves.stale_cutoff(now)`, then
        confirm each with `is_stale`). Ids only, so no Move content leaves
        without a visibility check."""
        rows = self.session.exec(
            select(Move.id)
            .where(Move.status == "live", col(Move.starts_at) <= cutoff)
            .order_by(col(Move.starts_at), col(Move.id))
        ).all()
        return list(rows)

    def participants(self, move_id: str) -> tuple[ParticipantSnapshot, ...]:
        """Participants in join order (`joined_at`, then user id)."""
        return tuple(self._participants([move_id])[move_id])

    def audience_ids(self, move_id: str) -> frozenset[str]:
        """Everyone in `move_audience` (not the creator, unless added)."""
        rows = self.session.exec(
            select(MoveAudience.user_id).where(MoveAudience.move_id == move_id)
        ).all()
        return frozenset(rows)

    # --- Writes --------------------------------------------------------------

    def create(self, new: NewMove, audience: ResolvedAudience) -> MoveSnapshot:
        """Write the Move, its creator participant and its audience; return
        the snapshot. Raises `MarkNotFound` if the Mark does not exist."""
        mark = self.session.get(Mark, new.mark_id)
        if mark is None:
            raise MarkNotFound(new.mark_id)
        move = Move(
            creator_id=new.creator_id,
            mark_id=new.mark_id,
            text=new.text,
            category=new.category,
            kind=new.kind,
            open=new.open,
            starts_at=new.starts_at,
            fill_deadline=new.fill_deadline,
            origin=new.origin,
            origin_ref=new.origin_ref,
            notify_user_ids=(
                None if new.notify_user_ids is None else list(new.notify_user_ids)
            ),
            created_at=new.starts_at,
        )
        self.session.add(move)
        self.session.flush()
        self.save_participant(move.id, new.creator)
        SqlAudienceRepository(self.session).save(move.id, audience)
        self.session.flush()
        return move_snapshot(move, mark, (new.creator,))

    def save_participant(self, move_id: str, p: ParticipantSnapshot) -> None:
        """Insert the participant, or overwrite the same user's row."""
        self.session.merge(
            MoveParticipant(
                move_id=move_id,
                user_id=p.user_id,
                status=p.status,
                joined_via=p.joined_via,
                joined_at=p.joined_at,
                arrived_at=p.arrived_at,
                left_at=p.left_at,
            )
        )
        self.session.flush()

    def add_audience(self, move_id: str, user_id: str, via: AudienceVia) -> None:
        """Add one audience member; keeps the existing `via` if already there."""
        if self.session.get(MoveAudience, (move_id, user_id)) is None:
            self.session.add(MoveAudience(move_id=move_id, user_id=user_id, via=via))
            self.session.flush()

    def set_ended(self, move_id: str, status: MoveStatus, ends_at: datetime) -> None:
        move = self.session.get_one(Move, move_id)
        move.status = status
        move.ends_at = ends_at
        self.session.add(move)
        self.session.flush()

    # --- Mapping -------------------------------------------------------------

    def _one(self, query: _MoveQuery) -> MoveSnapshot | None:
        found = self._many(query)
        return found[0] if found else None

    def _many(self, query: _MoveQuery) -> list[MoveSnapshot]:
        rows = self.session.exec(query).all()
        participants = self._participants(move.id for move, _ in rows)
        return [move_snapshot(move, mark, participants[move.id]) for move, mark in rows]

    def _participants(
        self, move_ids: Iterable[str]
    ) -> defaultdict[str, list[ParticipantSnapshot]]:
        by_move: defaultdict[str, list[ParticipantSnapshot]] = defaultdict(list)
        ids = list(move_ids)
        if not ids:
            return by_move
        rows = self.session.exec(
            select(MoveParticipant)
            .where(col(MoveParticipant.move_id).in_(ids))
            .order_by(col(MoveParticipant.joined_at), col(MoveParticipant.user_id))
        ).all()
        for row in rows:
            by_move[row.move_id].append(participant_snapshot(row))
        return by_move


def _moves() -> _MoveQuery:
    """`(Move, Mark)` pairs; add `.where(...)` and ordering."""
    return select(Move, Mark).join(Mark, col(Mark.id) == col(Move.mark_id))
