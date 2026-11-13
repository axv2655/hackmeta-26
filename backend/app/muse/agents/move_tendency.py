"""Tendency tab: how long the creator's Moves usually last, so friends still
pull up after a Move has started.

Python finds the facts (`domain.move_tendency.tendency` over the creator's
ended Moves: same Mark, else same category, else all). Muse only writes the
words. The feed never waits for the model:

- Every call answers at once from the template line (`source: heuristic`).
- When the runner is not deterministic, Moves without a Muse line get one
  batched agent call in the background; the next feed read shows it
  (`source: muse`). A failed or invalid answer keeps the template.
- Facts and lines are cached per Move id for the life of the process: a live
  Move's creator history does not change while it is live.

Reads `moves` and `users` only. Never reads or returns coordinates.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import replace

from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.domain.move_tendency import (
    PastMove,
    TendencyNote,
    format_duration,
    template_line,
    tendency,
)
from app.muse.context import AliasBook
from app.muse.lane import MuseLane
from app.ports import MoveSnapshot
from app.tables import Move, User

logger = logging.getLogger(__name__)

AGENT = "move_tendency"
MAX_TOKENS = 300
HISTORY_LIMIT = 30
"""Most recent ended Moves per creator that count."""
MAX_LINE = 70
CACHE_CAP = 2000


class TendencyOut(BaseModel):
    lines: dict[str, str] = Field(default_factory=dict)


def load_history(
    session: Session, creator_ids: Sequence[str]
) -> dict[str, list[PastMove]]:
    """The last `HISTORY_LIMIT` ended Moves of each creator, newest first."""
    if not creator_ids:
        return {}
    rows = session.exec(
        select(Move)
        .where(col(Move.creator_id).in_(list(creator_ids)))
        .where(Move.status == "ended")
        .where(col(Move.ends_at).is_not(None))
        .order_by(col(Move.starts_at).desc())
    ).all()
    out: dict[str, list[PastMove]] = {uid: [] for uid in creator_ids}
    for r in rows:
        past = out[r.creator_id]
        if len(past) < HISTORY_LIMIT and r.ends_at is not None:
            past.append(PastMove(r.mark_id, r.category, r.starts_at, r.ends_at))
    return out


def first_names(session: Session, user_ids: Sequence[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = session.exec(select(User).where(col(User.id).in_(list(user_ids)))).all()
    return {u.id: u.first_name for u in rows}


def describe(
    move: MoveSnapshot, past: Sequence[PastMove], first_name: str
) -> TendencyNote | None:
    """The template note for one live Move, or None without enough history."""
    if move.status != "live":
        return None
    found = tendency(past, move.mark.id, move.category)
    if found is None:
        return None
    return TendencyNote(
        line=template_line(first_name, move.mark.name, move.category, found),
        typical_minutes=found.typical_minutes,
        basis=found.basis,
        sample_size=found.sample_size,
    )


def check_lines(out: TendencyOut, expected: dict[str, TendencyNote]) -> TendencyOut:
    """Every alias answered, each line short and carrying the exact length."""
    for alias, note in expected.items():
        line = out.lines.get(alias, "").strip()
        if not line or len(line) > MAX_LINE:
            raise ValueError(f"bad line for {alias}")
        if format_duration(note.typical_minutes) not in line or "!" in line:
            raise ValueError(f"line for {alias} changes the facts")
    return out


class MoveTendencies:
    """Bound as the gateway extra `move_tendencies` (route reads it via getattr)."""

    def __init__(self, lane: MuseLane) -> None:
        self.lane = lane
        self._notes: dict[str, TendencyNote | None] = {}
        self._asked: set[str] = set()
        self._tasks: set[asyncio.Task[None]] = set()

    async def move_tendencies(
        self, moves: Sequence[MoveSnapshot]
    ) -> dict[str, TendencyNote]:
        live = [m for m in moves if m.status == "live"]
        self._fill(m for m in live if m.id not in self._notes)
        notes = {m.id: n for m in live if (n := self._notes.get(m.id)) is not None}
        if not self.lane.runner.deterministic:
            self._rewrite_later(
                {k: v for k, v in notes.items() if k not in self._asked}
            )
        return notes

    def _fill(self, moves) -> None:
        todo = list(moves)
        if not todo:
            return
        if len(self._notes) > CACHE_CAP:
            self._notes.clear()
            self._asked.clear()
        creators = sorted({m.creator_id for m in todo})
        with self.lane.session() as session:
            history = load_history(session, creators)
            names = first_names(session, creators)
        for m in todo:
            past = history.get(m.creator_id, [])
            self._notes[m.id] = describe(m, past, names.get(m.creator_id, ""))

    def _rewrite_later(self, notes: dict[str, TendencyNote]) -> None:
        if not notes:
            return
        self._asked.update(notes)
        task = asyncio.create_task(self._rewrite(notes))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _rewrite(self, notes: dict[str, TendencyNote]) -> None:
        """One batched Muse call; keeps the template on any failure."""
        aliases = AliasBook("t")
        expected: dict[str, TendencyNote] = {}
        rows = []
        for move_id, note in notes.items():
            alias = aliases.alias(move_id)
            expected[alias] = note
            rows.append(
                f"{alias} | template: {note.line} | basis {note.basis} | "
                f"length {format_duration(note.typical_minutes)} | "
                f"{note.sample_size} past Moves"
            )
        prompt = "Rows:\n" + "\n".join(rows)
        try:
            out, used_fallback = await self.lane.runner.run_agent_meta(
                AGENT,
                None,
                prompt,
                TendencyOut,
                lambda: TendencyOut(lines={a: n.line for a, n in expected.items()}),
                max_tokens=MAX_TOKENS,
                check=lambda o: check_lines(o, expected),
            )
        except Exception:  # never let a background rewrite surface anywhere
            logger.warning("move tendency rewrite failed", exc_info=True)
            return
        if used_fallback:
            return
        for alias, note in expected.items():
            move_id = aliases.id_of(alias)
            if move_id in self._notes:
                line = out.lines[alias].strip()
                self._notes[move_id] = replace(note, line=line, source="muse")
