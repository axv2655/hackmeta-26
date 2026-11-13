"""The "nobody bit" path (ARCHITECTURE.md 10.9).

When a flare passes its `fill_deadline`, or a regular Move is 15 minutes old,
and nobody else has joined, give the poster somewhere to go instead.

- Candidates: only Moves the user may join right now, from
  `MoveGateway.list_live_visible` plus `ProximityGateway.open_moves_near`.
  Nothing else is ever suggested. No candidates: send nothing.
- Never a "nobody came" message: such output is rejected (then the template,
  which never says it, is used).
- Stored with `create_suggestion(type=nobody_bit)` (sends `muse_nobody_bit`).
  Accepting joins the other Move and ends the empty one (M7's accept route).
- One suggestion per empty Move.
"""

from __future__ import annotations

import re
from datetime import timedelta

from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.muse.agents.move_ranker import rank_snapshots
from app.muse.context import MAX_MOVES, AliasBook, load_candidates
from app.muse.lane import MuseLane
from app.ports import MoveDraftOut, MoveSnapshot, SuggestionSnapshot
from app.services.suggestions import SuggestionService, draft_to_dict
from app.tables import Move, MoveParticipant, Suggestion, TasteProfile

AGENT = "nobody_bit"
MAX_TOKENS = 250
QUIET_AFTER = timedelta(minutes=15)
EXPIRES = timedelta(minutes=60)
FORBIDDEN = re.compile(
    r"\b(nobody|no one|no-one|noone)\b.{0,12}\b(came|come|showed|show|joined|join|"
    r"coming|bit|pulled|responded|answered)",
    re.IGNORECASE,
)


class NobodyOut(BaseModel):
    act: bool
    move: str | None = None
    message: str = ""
    chips: list[str] = Field(default_factory=list)


def says_nobody_came(text: str) -> bool:
    return bool(FORBIDDEN.search(text))


def _people(move: MoveSnapshot) -> list[str]:
    ids = [
        move.creator_id,
        *(p.user_id for p in move.participants if p.status != "left"),
    ]
    return list(dict.fromkeys(ids))


class NobodyBitService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane
        self.c = lane.container

    def due(self) -> list[str]:
        """Live Moves that are quiet: past fill deadline (flare) or 15 min
        old (move), nobody but the creator on them, not yet handled."""
        now = self.lane.now()
        moves = self.session.exec(select(Move).where(Move.status == "live")).all()
        handled = self._handled()
        out = []
        for m in moves:
            if m.id in handled:
                continue
            if m.kind == "flare":
                quiet = m.fill_deadline is not None and m.fill_deadline <= now
            else:
                quiet = m.created_at + QUIET_AFTER <= now
            if quiet and not self._joined(m.id, m.creator_id):
                out.append(m.id)
        return out

    async def scan(self) -> int:
        hits = 0
        for move_id in self.due():
            hits += await self.run(move_id) is not None
        return hits

    async def run(self, move_id: str) -> SuggestionSnapshot | None:
        own = self.c.moves.get(move_id)
        if own is None or own.status != "live" or move_id in self._handled():
            return None
        user = own.creator_id
        if any(p.user_id != user for p in own.participants if p.status != "left"):
            return None
        candidates = self.candidates(user, own)
        if not candidates:
            return None

        now = self.lane.now()
        everyone = {u for m in candidates for u in _people(m)} - {user}
        cands = load_candidates(self.session, user, everyone, now)
        scores = {c.user_id: c.affinity for c in cands}
        names = {c.user_id: c.first_name for c in cands}
        likes = self._likes(user)
        moves, people = AliasBook("m"), AliasBook("u")
        rows = []
        for m in candidates:
            crew = ", ".join(
                f"{people.alias(u, names.get(u, ''))}({scores.get(u, 0):.1f})"
                for u in _people(m)
                if u != user
            )
            rows.append(
                f'{moves.alias(m.id)} | {m.category} | {m.mark.name} | "{m.text}" | '
                f"{crew or '-'} | open {'y' if m.open else 'n'} | "
                f"{len(_people(m))} there"
            )
        prompt = "\n".join(
            [
                f'Own Move: "{own.text}" ({own.category}) at {own.mark.name}',
                f"User likes: {', '.join(sorted(likes)) or '-'}",
                "Candidates:",
                *rows,
            ]
        )
        by_id = {m.id: m for m in candidates}

        def check(out: NobodyOut) -> NobodyOut:
            if says_nobody_came(out.message) or any(
                says_nobody_came(c) for c in out.chips
            ):
                raise ValueError("never a 'nobody came' message")
            if out.act and moves.id_of(out.move) not in by_id:
                raise ValueError("unknown move alias")
            if out.act and not out.message.strip():
                raise ValueError("empty message")
            return out

        # The same pairwise ranking as the feed, with the poster's own category
        # counting as taste: the top Move is where to go instead.
        ranked = rank_snapshots(
            self.session, user, candidates, now, extra_likes=likes | {own.category}
        )
        best = by_id[ranked[0].move_id]

        def fallback() -> NobodyOut:
            return self._template(best, moves, people, scores, user)

        out, used_fallback = await self.lane.runner.run_agent_meta(
            AGENT,
            user,
            prompt,
            NobodyOut,
            fallback,
            max_tokens=MAX_TOKENS,
            slow=True,
            check=check,
        )
        if not out.act:
            return None
        target = by_id[moves.id_of(out.move)]
        message = people.restore(out.message)
        if says_nobody_came(message):  # restored names cannot add it, but be sure
            message = people.restore(fallback().message)
        draft = MoveDraftOut(
            mark_id=target.mark.id,
            text=target.text,
            category=target.category,
            chips=tuple(people.restore(c) for c in out.chips[:3]),
            source="heuristic" if used_fallback else "muse",
        )
        payload = {
            "message": message,
            "chips": list(draft.chips),
            "draft": draft_to_dict(draft),
            "target_move_id": target.id,
            "own_move_id": own.id,
        }
        return await SuggestionService(self.session, self.lane).create_suggestion(
            user, "nobody_bit", payload, now + EXPIRES
        )

    def candidates(self, user: str, own: MoveSnapshot) -> list[MoveSnapshot]:
        found: dict[str, MoveSnapshot] = {}
        for m in self.c.moves.list_live_visible(user):
            found.setdefault(m.id, m)
        for mid in self.c.proximity.open_moves_near(user):
            m = self.c.moves.get(mid)
            if m is not None and m.open:
                found.setdefault(m.id, m)
        out = [
            m
            for m in found.values()
            if m.id != own.id
            and m.status == "live"
            and m.creator_id != user
            and user not in {p.user_id for p in m.participants}
        ]
        out.sort(key=lambda m: m.id)
        return out[:MAX_MOVES]

    def _template(
        self,
        m: MoveSnapshot,
        moves: AliasBook,
        people: AliasBook,
        scores: dict[str, float],
        user: str,
    ) -> NobodyOut:
        others = [u for u in _people(m) if u != user]
        others.sort(key=lambda u: -scores.get(u, -99.0))
        lead = people.alias(others[0]) if others else None
        rest = len(others) - 1
        who = "{" + lead + "}" if lead else "A crew"
        who += f" + {rest}" if rest > 0 else ""
        verb = "are" if rest > 0 else "is"
        open_part = " and it's open" if m.open else ""
        message = f"Quiet one. {who} {verb} at {m.mark.name}{open_part}. Pull up?"
        chips = [f"{len(_people(m))} there"] + (["open Move"] if m.open else [])
        return NobodyOut(act=True, move=moves.alias(m.id), message=message, chips=chips)

    def _joined(self, move_id: str, creator_id: str) -> bool:
        rows = self.session.exec(
            select(MoveParticipant).where(
                MoveParticipant.move_id == move_id,
                MoveParticipant.user_id != creator_id,
            )
        ).all()
        return bool(rows)

    def _handled(self) -> set[str]:
        rows = self.session.exec(
            select(Suggestion).where(col(Suggestion.type) == "nobody_bit")
        ).all()
        return {(r.payload or {}).get("own_move_id") for r in rows} - {None}

    def _likes(self, user: str) -> set[str]:
        row = self.session.exec(
            select(TasteProfile).where(
                TasteProfile.subject_type == "user", TasteProfile.subject_id == user
            )
        ).first()
        words: set[str] = set()
        for phrase in row.likes if row else []:
            words.update(phrase.lower().split())
        return words
