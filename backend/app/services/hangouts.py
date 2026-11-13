"""Hangout rules and the `on_move_ended` recorder (surfaces lane, S8).

Decisions:
  * Two people hung out only if their `there` intervals overlap for a positive
    duration. Touching intervals (one leaves exactly as the other arrives) do
    not count.
  * Only participants with an `arrived_at` have an interval. A `left_at` of
    None means "still there when the Move ended", so the interval ends at the
    Move's `ends_at`.
  * The creator and every participant are prompted to rate, even if alone.
  * Hangout bucket is (weekday 0=Monday, hour of day), taken from a timezone-
    aware instant so the caller controls the clock. Stored rows use the
    Move's end in the demo's local time zone and the same part-of-day buckets
    as Muse (`domain/affinity.hour_bucket`), so pseudo-groups read them as-is.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from itertools import combinations
from typing import Any

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.container import Container
from app.domain.affinity import hour_bucket as part_of_day
from app.domain.affinity import local
from app.ports import MoveSnapshot
from app.tables.surfaces import Hangout

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Presence:
    """One continuous stretch a user spent `there` in a Move."""

    user_id: str
    arrived_at: datetime
    left_at: datetime | None


def overlapping_pairs(
    presences: Iterable[Presence], move_ended_at: datetime
) -> list[tuple[str, str]]:
    """Sorted, de-duplicated (user_a, user_b) pairs with user_a < user_b."""
    spans = [(p.user_id, p.arrived_at, p.left_at or move_ended_at) for p in presences]
    pairs = {
        (min(a_id, b_id), max(a_id, b_id))
        for (a_id, a_start, a_end), (b_id, b_start, b_end) in combinations(spans, 2)
        if a_id != b_id and a_start < b_end and b_start < a_end
    }
    return sorted(pairs)


def rating_recipients(presences: Iterable[Presence]) -> list[str]:
    """Sorted unique users who were ever `there`."""
    return sorted({p.user_id for p in presences})


def hangout_bucket(when: datetime) -> tuple[int, int]:
    """(weekday, hour) for a timezone-aware instant."""
    if when.tzinfo is None:
        raise ValueError("when must be timezone-aware")
    return (when.weekday(), when.hour)


def presences_of(move: MoveSnapshot) -> list[Presence]:
    """Intervals for participants who actually arrived."""
    return [
        Presence(p.user_id, p.arrived_at, p.left_at)
        for p in move.participants
        if p.arrived_at is not None
    ]


def prompt_recipients(move: MoveSnapshot) -> list[str]:
    """The creator plus every participant, sorted and unique."""
    return sorted({move.creator_id, *(p.user_id for p in move.participants)})


class HangoutRecorder:
    """Runs on `on_move_ended`: history rows, rate prompts, crew refresh."""

    def __init__(self, engine: Engine, container: Container) -> None:
        self._engine = engine
        self._container = container

    async def on_move_ended(self, move_id: str) -> None:
        move = self._container.moves.get(move_id)
        if move is None:
            return
        if self._already_recorded(move_id):
            return
        recipients = prompt_recipients(move)
        await _guarded("hangout rows", self._write_pairs, move)
        await _guarded("rate_move", self._send_prompts, move, recipients)
        await _guarded("rating.prompt", self._publish_prompt, move, recipients)
        await _guarded("pseudo groups", self._refresh_groups, move)

    def _already_recorded(self, move_id: str) -> bool:
        with Session(self._engine) as session:
            stmt = select(Hangout).where(Hangout.move_id == move_id).limit(1)
            return session.exec(stmt).first() is not None

    async def _write_pairs(self, move: MoveSnapshot) -> None:
        ended_at = move.ends_at or self._container.clock.now()
        pairs = overlapping_pairs(presences_of(move), ended_at)
        if not pairs:
            return
        weekday = local(ended_at).weekday()
        rows = [
            Hangout(
                user_a=a,
                user_b=b,
                move_id=move.id,
                mark_id=move.mark.id,
                category=move.category,
                weekday=weekday,
                hour_bucket=part_of_day(ended_at),
                at=ended_at,
            )
            for a, b in pairs
        ]
        with Session(self._engine) as session:
            session.add_all(rows)
            session.commit()

    async def _send_prompts(self, move: MoveSnapshot, recipients: list[str]) -> None:
        data = {"move_id": move.id, "route": f"/move/{move.id}/rate"}
        for user_id in recipients:
            await _guarded(
                f"rate_move to {user_id}",
                self._container.notifier.send,
                user_id,
                "rate_move",
                f"How was {move.mark.name}?",
                "Rank it in two taps.",
                dict(data),
            )

    async def _publish_prompt(self, move: MoveSnapshot, recipients: list[str]) -> None:
        await self._container.events.publish(
            recipients,
            "rating.prompt",
            {"move_id": move.id, "mark_name": move.mark.name},
        )

    async def _refresh_groups(self, move: MoveSnapshot) -> None:
        refresh = getattr(self._container.muse, "refresh_pseudo_groups", None)
        if refresh is None:
            return
        result = refresh([p.user_id for p in move.participants])
        if hasattr(result, "__await__"):
            await result


async def _guarded(label: str, step: Callable[..., Awaitable[Any]], *args: Any) -> None:
    """Run one step; log and swallow its failure so the others still run."""
    try:
        await step(*args)
    except Exception:
        logger.exception("hangout recorder step %s failed", label)
