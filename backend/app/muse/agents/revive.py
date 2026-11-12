"""Revive agent (ARCHITECTURE.md 10.8): bring a fading friend group back.

`run_revive_scan(user_id)` refreshes the user's pseudo-groups first (so Demo
Control works without the nightly job), then, at most once a week per user,
picks the strongest fading group and stores a `revive` suggestion (which
sends `muse_revive`). Accepting it returns the composer draft: the group's
top Mark, the members as audience, and a suggested time.

`draft_for(group)` builds the same draft for `POST /pseudo-groups/{id}/revive`
without storing anything.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from pydantic import BaseModel, Field
from sqlmodel import Session

from app.domain import pseudo_groups as pg
from app.muse.agents import move_writer
from app.muse.agents.move_writer import WriterInput
from app.muse.compose import ComposeService
from app.muse.context import AliasBook, People
from app.muse.lane import MuseLane
from app.muse.pseudo_groups import PseudoGroupService
from app.ports import MoveDraftOut, SuggestionSnapshot
from app.services.suggestions import SuggestionService, draft_to_dict
from app.tables import PseudoGroup

AGENT = "revive"
MAX_TOKENS = 250
WEEKLY = timedelta(days=7)
EXPIRES = timedelta(days=3)


class ReviveOut(BaseModel):
    message: str = Field(min_length=1)
    text: str = ""
    chips: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class Revival:
    message: str
    draft: MoveDraftOut


def _names(first: list[str]) -> str:
    if len(first) <= 1:
        return "".join(first)
    return ", ".join(first[:-1]) + " and " + first[-1]


def _weeks(days: float) -> str:
    weeks = round(days / 7)
    if weeks < 1:
        return f"{int(days)} days"
    return "a week" if weeks == 1 else f"{weeks} weeks"


class ReviveService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane

    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None:
        groups = PseudoGroupService(self.session, self.lane)
        await groups.refresh(user_id)
        now = self.lane.now()
        svc = SuggestionService(self.session, self.lane)
        if svc.recent(user_id, ("revive",), now - WEEKLY):
            return None
        fading = [g for g in groups.owned(user_id) if g.fading]
        if not fading:
            return None
        group = max(fading, key=lambda g: (g.strength, g.id))
        revival = await self.draft_for(group)
        payload = {
            "message": revival.message,
            "chips": list(revival.draft.chips),
            "draft": draft_to_dict(revival.draft),
            "group_id": group.id,
            "mark_id": revival.draft.mark_id,
        }
        return await svc.create_suggestion(user_id, "revive", payload, now + EXPIRES)

    async def draft_for(self, group: PseudoGroup) -> Revival:
        now = self.lane.now()
        owner = group.owner_id
        people = People.load(self.session, [owner, *group.member_ids])
        firsts = [people.first(u) for u in group.member_ids]
        p = group.pattern or {}
        mark_ids = p.get("mark_ids") or []
        mark = (
            ComposeService(self.session, self.lane).mark(mark_ids[0])
            if mark_ids
            else None
        )
        since = (
            (now - group.last_hangout_at).total_seconds() / 86400
            if group.last_hangout_at
            else 0
        )
        when = pg.describe_when(p)
        bucket = (p.get("hour_buckets") or [""])[0]
        chips = [f"last together {_weeks(since)} ago"]
        if when:
            chips.append(f"usually {when}" + (f", {bucket}" if bucket else ""))

        book, places = AliasBook("u"), AliasBook("k")
        aliases = [book.alias(u, people.first(u)) for u in group.member_ids]
        k = places.alias(mark.id, mark.name) if mark else None
        prompt = "\n".join(
            [
                f"Members: {', '.join('{' + a + '}' for a in aliases)}",
                f"Did together: {', '.join(p.get('categories') or ['hanging out'])}",
                f"Where: {'{' + k + '}' if k else 'varied'}",
                f"When: {when or 'varies'} {bucket}".rstrip(),
                f"Last together: {_weeks(since)} ago",
            ]
        )
        place = mark.name if mark else "hang out"
        fallback_msg = (
            f"You, {_names(firsts)} used to {('hit ' + place) if mark else place}"
            f"{' on ' + when if when else ''}. Want to get everyone back together?"
        )
        writer_text = move_writer.fallback(WriterInput(owner, mark, now)).text

        out = await self.lane.runner.run_agent(
            AGENT,
            owner,
            prompt,
            ReviveOut,
            lambda: ReviveOut(message=fallback_msg, text=writer_text, chips=chips),
            max_tokens=MAX_TOKENS,
        )
        text = move_writer.normalize(out.text)
        if not text or len(text) >= move_writer.MAX_LEN:
            text = writer_text
        out_chips = [book.restore(c, places) for c in out.chips[:3]] or chips
        if when and not any("usually" in c or when in c for c in out_chips):
            out_chips.append(_next_slot(when, bucket))
        draft = MoveDraftOut(
            mark_id=mark.id if mark else None,
            text=text,
            category=mark.category if mark else (p.get("categories") or ["other"])[0],
            user_ids=tuple(group.member_ids),
            chips=tuple(out_chips[:3]),
        )
        return Revival(book.restore(out.message, places), draft)


def _next_slot(when: str, bucket: str) -> str:
    return f"try {when.rstrip('s').lower()} {bucket}".strip()
