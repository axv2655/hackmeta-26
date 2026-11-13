"""Notify picker (ARCHITECTURE.md 10.3): who gets a nudge for a Move.

Deterministic by default: the pick is the top of the affinity ranking Python
already computed, so the poke step never waits on a model, and every nudge
reads the same fixed line (who, what, where, time left to join). Muse can
still make the pick when a request sets `use_muse`; it never writes the line.

Input is already filtered by the pipeline (audience minus participants,
co-present cluster, quiet hours, already notified). Hard rules hold whether
Muse answered or the ranking ran:

- cap `min(8, ceil(audience / 2))` picks, forced picks on top;
- never someone busy, never an unknown alias, never a dropped id;
- at most one stretch pick, and only if verified. A stretch pick has no
  hangouts in 90 days while others in the pool do (with no history at all,
  nobody is a stretch);
- the copy is always `template_copy`, never model output.

Each pick carries `source`: "muse" only when Muse answered and chose that
person itself; ranked picks and creator-forced picks say "heuristic".
"""

from __future__ import annotations

import math
from collections.abc import Collection, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.affinity import clock_label, local
from app.muse.context import AliasBook, Candidate, render_candidates
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import Category, NotifyPickOut

AGENT = "notify_picker"
MAX_TOKENS = 500
MAX_PICKS = 8
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class Pick(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user: str
    line: str = Field(default="", alias="copy", max_length=400)
    reason: str = ""


class PickerOut(BaseModel):
    picks: list[Pick] = Field(default_factory=list)
    skipped_note: str = ""


def cap_for(audience_size: int) -> int:
    return min(MAX_PICKS, math.ceil(audience_size / 2))


@dataclass(frozen=True)
class NotifyRequest:
    creator_id: str
    creator_first: str
    text: str
    category: Category
    mark_name: str
    when: datetime
    candidates: Sequence[Candidate]
    audience_size: int
    there: Sequence[tuple[str, str]] = ()
    """(user_id, first_name) of participants already there."""
    force_ids: frozenset[str] = frozenset()
    drop_ids: frozenset[str] = frozenset()
    agent: str = AGENT
    join_minutes: int | None = None
    """Minutes left on the fill timer, when the Move has one."""
    use_muse: bool = False
    """False: rank by affinity, no model call. True: Muse picks, ranking on failure."""


@dataclass(frozen=True)
class NotifyResult:
    picks: list[NotifyPickOut]
    skipped_note: str = ""
    cap: int = 0
    by_id: dict[str, Candidate] = field(default_factory=dict)


def template_copy(req: NotifyRequest) -> str:
    """The one fixed line everyone gets: who, what, where, time left to join."""
    there = [name for uid, name in req.there if uid != req.creator_id]
    line = f'{req.creator_first} posted "{req.text}" at {req.mark_name}.'
    if req.join_minutes:
        line += f" {req.join_minutes} min to join."
    if len(there) == 1:
        line += f" {there[0]}'s already there."
    elif there:
        line += f" {there[0]} + {len(there) - 1} are already there."
    return line


def template_reason(c: Candidate) -> str:
    f = c.features
    if f.is_close_friend:
        return "one of your closest"
    if f.hangouts_30d:
        return f"hung out {f.hangouts_30d}x this month"
    if f.same_category:
        return "you do this together"
    if f.pull_up_rate >= 0.5:
        return "usually pulls up"
    if f.shared_circles:
        return "in your circle"
    return "wider circle"


async def pick(runner: MuseRunner, req: NotifyRequest) -> NotifyResult:
    eligible = [c for c in req.candidates if c.user_id not in req.drop_ids]
    by_id = {c.user_id: c for c in eligible}
    force = [uid for uid in req.force_ids if uid in by_id]
    cap = cap_for(req.audience_size)

    if not eligible:
        return NotifyResult([], "", cap, by_id)

    book = AliasBook()
    creator = book.alias(req.creator_id, req.creator_first)
    there_aliases = [book.alias(uid, name) for uid, name in req.there]
    rows, _ = render_candidates(eligible, book, first=force)
    t = local(req.when)
    there_list = ", ".join(there_aliases) or "nobody"
    prompt = "\n".join(
        [
            f'Move: "{req.text}" ({req.category}) at {req.mark_name}, '
            f"{WEEKDAYS[t.weekday()]} {clock_label(req.when)}.",
            f"Creator: {creator}. Already there: {there_list}.",
            f"Cap: at most {cap} picks.",
            f"Must include: {', '.join(book.alias(u) for u in force) or 'none'}.",
            "Candidates:",
            rows,
        ]
    )

    def finalize(out: PickerOut, source: str = "heuristic") -> NotifyResult:
        return _finalize(req, out, book, by_id, force, cap, source)

    def check(out: PickerOut) -> PickerOut:
        result = finalize(out)
        if cap and not [p for p in result.picks if p.user_id not in force]:
            if any(not c.busy for c in eligible if c.user_id not in force):
                raise AgentRejected("no usable picks")
        return out

    def fallback() -> PickerOut:
        top = [c for c in eligible if not c.busy and c.user_id not in force]
        has_history = any(not c.stretch for c in eligible)
        top = [c for c in top if c.verified or not (c.stretch and has_history)][:cap]
        return PickerOut(
            picks=[
                Pick(user=book.alias(c.user_id), reason=template_reason(c)) for c in top
            ],
            skipped_note="",
        )

    if not req.use_muse:
        return finalize(fallback())

    out, used_fallback = await runner.run_agent_meta(
        req.agent,
        req.creator_id,
        prompt,
        PickerOut,
        fallback,
        max_tokens=MAX_TOKENS,
        slow=True,
        check=check,
    )
    return finalize(out, "heuristic" if used_fallback else "muse")


def _finalize(
    req: NotifyRequest,
    out: PickerOut,
    book: AliasBook,
    by_id: dict[str, Candidate],
    force: Collection[str],
    cap: int,
    source: str = "heuristic",
) -> NotifyResult:
    chosen: list[NotifyPickOut] = []
    seen: set[str] = set()
    stretch_used = False
    has_history = any(not c.stretch for c in by_id.values())
    copies: dict[str, Pick] = {}
    for p in out.picks:
        uid = book.id_of(p.user)
        if uid is None or uid not in by_id or uid in seen:
            continue
        seen.add(uid)
        copies[uid] = p
        c = by_id[uid]
        if uid in force:
            continue  # added below, after the cap
        if c.busy or uid in req.drop_ids:
            continue
        if c.stretch and has_history:
            if not c.verified or stretch_used:
                continue
            stretch_used = True
        if len(chosen) < cap:
            chosen.append(_make(req, book, c, p, source))
    for uid in force:
        chosen.append(_make(req, book, by_id[uid], copies.get(uid)))
    return NotifyResult(chosen, book.restore(out.skipped_note), cap, by_id)


def _make(
    req: NotifyRequest,
    book: AliasBook,
    c: Candidate,
    p: Pick | None,
    source: str = "heuristic",
) -> NotifyPickOut:
    reason = book.restore(p.reason).strip() if p and p.reason else ""
    return NotifyPickOut(
        c.user_id, template_copy(req), reason or template_reason(c), source
    )
