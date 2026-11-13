"""The seeded example Moves stay alive and visible for anyone who opens the app.

The demo world (`app/seed/core.py`) has a few live Moves and one from last
night (its ghosts). Left alone they would go stale after three quiet hours and
only reach the seeded people. Every few minutes this:

  * shifts each example Move's clock (start, end, every join and arrival) so
    it always reads as it did at seed time ("10 m ago"), and revives a live
    example the stale job ended;
  * adds every user to the audience of the live examples, unless the creator
    blocked them, so a new account sees them straight away.

Moves people make themselves are never touched.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.ports import Clock
from app.seed.core import MOVES, SeedMove
from app.tables import Block, Move, MoveAudience, MoveParticipant, User

DRIFT = timedelta(minutes=2)  # leave the clock alone if it's this close


def join_examples(session: Session, user_id: str) -> None:
    """Put one user in the audience of every live example Move. No commit."""
    for spec in MOVES:
        move = session.get(Move, spec.id)
        if move is None or move.status != "live" or move.creator_id == user_id:
            continue
        if _blocked(session, move.creator_id, user_id):
            continue
        if session.get(MoveAudience, (spec.id, user_id)) is None:
            session.add(MoveAudience(move_id=spec.id, user_id=user_id, via="direct"))


class ExampleMoves:
    def __init__(self, engine: Engine, clock: Clock) -> None:
        self.engine = engine
        self.clock = clock

    def refresh(self) -> None:
        with Session(self.engine) as session:
            user_ids = session.exec(select(User.id)).all()
            for spec in MOVES:
                move = session.get(Move, spec.id)
                if move is None:
                    continue
                self._retime(session, move, spec)
            session.flush()
            for user_id in user_ids:
                join_examples(session, user_id)
            session.commit()

    def _retime(self, session: Session, move: Move, spec: SeedMove) -> None:
        now = self.clock.now()
        delta = (now - timedelta(minutes=spec.started)) - move.starts_at
        if spec.ended is None and move.status != "live":
            move.status, move.ends_at = "live", None
        if abs(delta) < DRIFT:
            session.add(move)
            return
        move.starts_at += delta
        if move.ends_at is not None:
            move.ends_at += delta
        session.add(move)
        rows = session.exec(
            select(MoveParticipant).where(col(MoveParticipant.move_id) == spec.id)
        ).all()
        for p in rows:
            p.joined_at += delta
            if p.arrived_at is not None:
                p.arrived_at += delta
            if p.left_at is not None:
                p.left_at += delta
            session.add(p)


def _blocked(session: Session, creator_id: str, viewer_id: str) -> bool:
    return session.get(Block, (creator_id, viewer_id)) is not None
