"""Move ranker (ARCHITECTURE.md 10.5): order the visible live Moves, with a
one-line reason for the "For you" strip.

- At most 15 Moves go to Muse; any beyond that follow in fallback order.
- Every input Move appears exactly once: Muse's unknown or duplicate aliases
  are dropped and missing Moves are appended in fallback order.
- Fallback: by the highest affinity of anyone on the Move, newest first.
- Results are cached per viewer for 45 s (same set of Moves); the app gets
  the heuristic order at once while Muse ranks in the background.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.muse.context import MAX_MOVES, AliasBook, load_candidates
from app.muse.lane import MuseLane
from app.ports import MoveSnapshot, RankedMove
from app.tables import TasteProfile

AGENT = "move_ranker"
MAX_TOKENS = 400
CACHE_TTL_S = 45.0


class RankItem(BaseModel):
    move: str
    reason: str = ""


class RankerOut(BaseModel):
    ranked: list[RankItem] = Field(default_factory=list)


def _people(move: MoveSnapshot, viewer_id: str) -> list[str]:
    ids = [
        move.creator_id,
        *(p.user_id for p in move.participants if p.status != "left"),
    ]
    return [uid for uid in dict.fromkeys(ids) if uid != viewer_id]


def fallback_order(
    moves: Sequence[MoveSnapshot], viewer_id: str, scores: dict[str, float]
) -> list[MoveSnapshot]:
    def best(move: MoveSnapshot) -> float:
        return max(
            (scores.get(u, -99.0) for u in _people(move, viewer_id)), default=-99.0
        )

    by_new = sorted(moves, key=lambda m: m.created_at, reverse=True)
    return sorted(by_new, key=best, reverse=True)  # stable: newest first on ties


def fallback_reason(
    move: MoveSnapshot, viewer_id: str, scores: dict[str, float], names: dict[str, str]
) -> str:
    close = [u for u in _people(move, viewer_id) if scores.get(u, -99.0) > 0]
    close.sort(key=lambda u: -scores[u])
    if not close:
        return ""
    shown = " + ".join(names.get(u, "a friend") for u in close[:2])
    more = len(close) - 2
    return f"{shown} + {more}" if more > 0 else shown


@dataclass
class MoveRanker:
    """`wait=False` (the app): answer at once with the heuristic order and
    rank with Muse in the background; the Muse order serves the next call
    within 45 s (10.12: heuristic now, Muse when it lands). Core's
    `/moves/nearby` gives up after 2 s, which would cancel a blocking call.
    `wait=True` awaits Muse (tests, Demo Control)."""

    lane: MuseLane
    ttl_s: float = CACHE_TTL_S
    wait: bool = False
    _cache: dict[tuple[str, tuple[str, ...]], tuple[float, list[RankedMove]]] = field(
        default_factory=dict
    )
    _inflight: dict[tuple[str, tuple[str, ...]], asyncio.Task[None]] = field(
        default_factory=dict
    )

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]:
        if not moves:
            return []
        key = (viewer_id, tuple(sorted(m.id for m in moves)))
        hit = self._cache.get(key)
        if hit and hit[0] > time.monotonic():
            return list(hit[1])
        if self.wait:
            await self._refresh(key, viewer_id, list(moves))
            return list(self._cache[key][1])
        if key not in self._inflight:
            task = asyncio.create_task(self._refresh(key, viewer_id, list(moves)))
            self._inflight[key] = task
            task.add_done_callback(lambda _: self._inflight.pop(key, None))
        with self.lane.session() as session:
            return self.heuristic(session, viewer_id, list(moves))

    async def settle(self) -> None:
        """Wait for background rankings (tests)."""
        while self._inflight:
            await asyncio.gather(*self._inflight.values(), return_exceptions=True)

    async def _refresh(
        self,
        key: tuple[str, tuple[str, ...]],
        viewer_id: str,
        moves: list[MoveSnapshot],
    ) -> None:
        with self.lane.session() as session:
            result = await self._rank(session, viewer_id, moves)
        self._cache[key] = (time.monotonic() + self.ttl_s, result)

    def heuristic(
        self, session: Session, viewer_id: str, moves: list[MoveSnapshot]
    ) -> list[RankedMove]:
        everyone = {u for m in moves for u in _people(m, viewer_id)}
        cands = load_candidates(session, viewer_id, everyone, self.lane.now())
        scores = {c.user_id: c.affinity for c in cands}
        names = {c.user_id: c.first_name for c in cands}
        return [
            RankedMove(m.id, fallback_reason(m, viewer_id, scores, names))
            for m in fallback_order(moves, viewer_id, scores)
        ]

    async def _rank(
        self, session: Session, viewer_id: str, moves: list[MoveSnapshot]
    ) -> list[RankedMove]:
        now = self.lane.now()
        everyone = {u for m in moves for u in _people(m, viewer_id)}
        cands = load_candidates(session, viewer_id, everyone, now)
        scores = {c.user_id: c.affinity for c in cands}
        names = {c.user_id: c.first_name for c in cands}
        ordered = fallback_order(moves, viewer_id, scores)
        head, tail = ordered[:MAX_MOVES], ordered[MAX_MOVES:]

        movebook, people = AliasBook("m"), AliasBook("u")
        likes = _taste_words(session, viewer_id)
        rows = []
        for m in head:
            alias = movebook.alias(m.id)
            crew = ", ".join(
                f"{people.alias(u, names.get(u, ''))}({scores.get(u, 0):.1f})"
                for u in _people(m, viewer_id)
            )
            fits = (
                "y" if (m.category in likes or set(m.mark.vibe_tags) & likes) else "n"
            )
            fill = (
                f"{max(0, int((m.fill_deadline - now).total_seconds() // 60))}"
                if m.fill_deadline
                else "-"
            )
            age = int((now - m.created_at).total_seconds() // 60)
            rows.append(
                f'{alias} | {m.category} | {m.mark.name} | "{m.text}" | {crew or "-"} '
                f"| {fits} | {fill} | {age}"
            )
        prompt = "Moves:\n" + "\n".join(rows)

        def fallback() -> RankerOut:
            return RankerOut(
                ranked=[
                    RankItem(
                        move=movebook.alias(m.id),
                        reason=fallback_reason(m, viewer_id, scores, names),
                    )
                    for m in head
                ]
            )

        out = await self.lane.runner.run_agent(
            AGENT,
            viewer_id,
            prompt,
            RankerOut,
            fallback,
            max_tokens=MAX_TOKENS,
            slow=True,
        )
        return self._repair(out, head, tail, movebook, people, viewer_id, scores, names)

    def _repair(
        self,
        out: RankerOut,
        head: list[MoveSnapshot],
        tail: list[MoveSnapshot],
        movebook: AliasBook,
        people: AliasBook,
        viewer_id: str,
        scores: dict[str, float],
        names: dict[str, str],
    ) -> list[RankedMove]:
        by_id = {m.id: m for m in head}
        result: list[RankedMove] = []
        seen: set[str] = set()
        for item in out.ranked:
            mid = movebook.id_of(item.move)
            if mid is None or mid not in by_id or mid in seen:
                continue
            seen.add(mid)
            reason = people.restore(item.reason).strip()
            if "{" in reason:
                reason = fallback_reason(by_id[mid], viewer_id, scores, names)
            result.append(RankedMove(mid, reason))
        for m in head + tail:
            if m.id not in seen:
                seen.add(m.id)
                result.append(
                    RankedMove(m.id, fallback_reason(m, viewer_id, scores, names))
                )
        return result


def _taste_words(session: Session, user_id: str) -> set[str]:
    row = session.exec(
        select(TasteProfile).where(
            TasteProfile.subject_type == "user", TasteProfile.subject_id == user_id
        )
    ).first()
    if row is None:
        return set()
    words: set[str] = set()
    for phrase in [*row.likes, row.summary]:
        words.update(w.strip(".,").lower() for w in phrase.split())
    return words
