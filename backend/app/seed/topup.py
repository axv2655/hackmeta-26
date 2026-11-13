"""Idempotent top-up of the demo seed (plan B.3).

Adds whatever seed rows are missing to a database that already holds the core
world (and maybe real accounts), and never drops anything:

* Marks and Saved Marks from the core seed, by primary key.
* History: the ended Moves, participants, audiences and hangouts, unless
  `mv_hist_00` already exists.
* Surfaces: Reels, calendar blocks and saved Reels by primary key; a user's
  seeded ranking for a category only when they have no ranking there yet;
  Ratings on the stored history Moves when that (Move, user) has none.
* Muse: pseudo-groups recomputed for the cast (matched by member set, so ids
  and Muse labels survive) and Anish's taste profile upserted.

Run it once on the configured database (owner only, plan B.4):
    uv run python -m app.seed.topup
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, col, select

from app.core import db
from app.core.clock import SystemClock
from app.ports import Clock
from app.seed import core, history, ids, muse, surfaces
from app.seed.history import HistoryMove
from app.tables import Mark, MarkRanking, Move, MoveParticipant, Rating, User


class CoreWorldMissing(RuntimeError):
    """The cast is not in the database: run the full seed instead."""


def topup(session: Session, clock: Clock) -> dict[str, int]:
    """Insert the missing seed rows, commit, and return how many of each."""
    now = clock.now()
    missing = [u for u in ids.CAST if session.get(User, u) is None]
    if missing:
        raise CoreWorldMissing(f"missing cast users: {', '.join(missing)}")
    counts = {
        "marks": insert_missing(session, (core.mark_row(p) for p in core.PLACES)),
        "saved_marks": insert_missing(
            session, (core.saved_mark_row(s, now) for s in core.SAVES)
        ),
        "history_moves": _history(session, clock),
        "reels": insert_missing(session, surfaces.reel_rows()),
        "calendar_events": insert_missing(session, surfaces.calendar_rows(now)),
        "saved_reels": insert_missing(session, surfaces.saved_reel_rows(now)),
        "mark_rankings": _rankings(session),
        "ratings": _ratings(session),
    }
    counts["pseudo_groups"] = muse.refresh_groups(session, clock, ids.CAST)
    counts["taste_profiles"] = int(muse.upsert_anish_taste(session, clock))
    session.commit()
    return counts


def insert_missing(session: Session, rows: Iterable[SQLModel]) -> int:
    """Add each row whose primary key is not stored yet; return how many."""
    added = 0
    for row in rows:
        key = inspect(type(row)).primary_key_from_instance(row)
        if session.get(type(row), tuple(key)) is None:
            session.add(row)
            added += 1
    session.flush()
    return added


def _history(session: Session, clock: Clock) -> int:
    if session.get(Move, ids.FIRST_HISTORY_MOVE) is not None:
        return 0
    return history.seed(session, clock)


def _rankings(session: Session) -> int:
    """Seed a (user, category) list only where the user has no list yet, so a
    real ranking is never interleaved with seeded positions."""
    taken = {(r.user_id, r.category) for r in session.exec(select(MarkRanking)).all()}
    fresh = [
        row
        for row in surfaces.ranking_rows()
        if (row.user_id, row.category) not in taken
        and session.get(Mark, row.mark_id) is not None
    ]
    session.add_all(fresh)
    session.flush()
    return len(fresh)


def _ratings(session: Session) -> int:
    rated = {(r.move_id, r.user_id) for r in session.exec(select(Rating)).all()}
    fresh = [
        row
        for row in surfaces.rating_rows(stored_history(session))
        if (row.move_id, row.user_id) not in rated
    ]
    session.add_all(fresh)
    session.flush()
    return len(fresh)


def stored_history(session: Session) -> list[HistoryMove]:
    """The history Moves as stored, so Ratings match their real Mark even when
    the history was written at another time than this top-up."""
    moves = session.exec(
        select(Move).where(col(Move.id).startswith(ids.HISTORY_MOVE_PREFIX))
    ).all()
    people: dict[str, list[MoveParticipant]] = {}
    for p in session.exec(
        select(MoveParticipant).where(
            col(MoveParticipant.move_id).in_([m.id for m in moves])
        )
    ).all():
        people.setdefault(p.move_id, []).append(p)
    return [_as_history(m, people.get(m.id, [])) for m in moves if m.ends_at]


def _as_history(move: Move, participants: list[MoveParticipant]) -> HistoryMove:
    others = sorted(p.user_id for p in participants if p.user_id != move.creator_id)
    return HistoryMove(
        id=move.id,
        user_ids=(move.creator_id, *others),
        mark_id=move.mark_id,
        category=move.category,
        text=move.text,
        starts_at=move.starts_at,
        ends_at=move.ends_at or move.starts_at,
    )


def main() -> None:
    with Session(db.engine) as session:
        counts = topup(session, SystemClock())
    for name, count in counts.items():
        print(f"{name}: {count}")


if __name__ == "__main__":
    main()
