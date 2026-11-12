"""Taste profiles and spot suggestions (ARCHITECTURE.md 10.7).

`on_rating_submitted(move_id, user_id)` (surfaces fires it) updates the
rater's profile and the profile of every pseudo-group of the rater whose
members all attended that Move. Ratings, rankings and Marks are read-only
here; only `taste_profiles` is written.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from sqlmodel import Session, col, select

from app.muse.agents import taste as agent
from app.muse.agents.taste import RatingFact, SpotCandidate, TasteOut
from app.muse.compose import snapshot
from app.muse.lane import MuseLane
from app.ports import MarkSnapshot, TasteSubject
from app.tables import (
    Mark,
    MarkRanking,
    MoveParticipant,
    PseudoGroup,
    Rating,
    TasteProfile,
)
from app.tables import Move as MoveRow

SPOT_POOL = 30


class TasteService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane

    def profile(
        self, subject_type: TasteSubject, subject_id: str
    ) -> TasteProfile | None:
        return self.session.exec(
            select(TasteProfile).where(
                TasteProfile.subject_type == subject_type,
                TasteProfile.subject_id == subject_id,
            )
        ).first()

    def upsert(
        self, subject_type: TasteSubject, subject_id: str, out: TasteOut
    ) -> TasteProfile:
        row = self.profile(subject_type, subject_id) or TasteProfile(
            subject_type=subject_type, subject_id=subject_id, updated_at=self.lane.now()
        )
        row.summary, row.likes, row.dislikes = out.summary, out.likes, out.dislikes
        row.updated_at = self.lane.now()
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    async def on_rating_submitted(self, move_id: str, user_id: str) -> list[str]:
        """Returns the subject ids whose profile was updated."""
        mine = self._ratings(move_id, [user_id])
        if not mine:
            return []
        updated = [user_id]
        await self._update("user", user_id, user_id, mine)

        attended = self._attendees(move_id)
        groups = self.session.exec(
            select(PseudoGroup).where(PseudoGroup.owner_id == user_id)
        ).all()
        for g in groups:
            members = set(g.member_ids) | {user_id}
            if members <= attended:
                facts = self._ratings(move_id, members)
                await self._update("pseudo_group", g.id, user_id, facts)
                updated.append(g.id)
        return updated

    async def _update(
        self,
        subject_type: TasteSubject,
        subject_id: str,
        rater: str,
        facts: list[RatingFact],
    ) -> None:
        row = self.profile(subject_type, subject_id)
        prev = (
            TasteOut(summary=row.summary, likes=row.likes, dislikes=row.dislikes)
            if row
            else None
        )
        out = await agent.update_profile(
            self.lane.runner, rater, subject_type, prev, facts
        )
        self.upsert(subject_type, subject_id, out)

    def _ratings(
        self, move_id: str, user_ids: Sequence[str] | set[str]
    ) -> list[RatingFact]:
        rows = self.session.exec(
            select(Rating).where(
                Rating.move_id == move_id, col(Rating.user_id).in_(list(user_ids))
            )
        ).all()
        facts = []
        for r in rows:
            mark = self.session.get(Mark, r.mark_id)
            facts.append(
                RatingFact(
                    stars=r.stars,
                    vibe_tags=tuple(r.vibe_tags),
                    note=r.note,
                    mark_name=mark.name if mark else "a spot",
                    category=mark.category if mark else "other",
                    mark_tags=tuple(mark.vibe_tags) if mark else (),
                )
            )
        return facts

    def _attendees(self, move_id: str) -> set[str]:
        move = self.lane.container.moves.get(move_id)
        if move is not None:
            return {move.creator_id} | {
                p.user_id
                for p in move.participants
                if p.status == "there" or p.arrived_at is not None
            }
        row = self.session.get(MoveRow, move_id)
        parts = self.session.exec(
            select(MoveParticipant).where(MoveParticipant.move_id == move_id)
        ).all()
        return ({row.creator_id} if row else set()) | {
            p.user_id for p in parts if p.status == "there" or p.arrived_at
        }

    # --- suggest-spots ---------------------------------------------------------

    async def suggest_spots(
        self,
        user_id: str,
        user_ids: Sequence[str],
        *,
        category: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> list[tuple[MarkSnapshot, str]]:
        group = list(dict.fromkeys([user_id, *user_ids]))
        if coarse is not None:
            marks = self.lane.container.marks.nearest(*coarse, SPOT_POOL)
        else:
            marks = [snapshot(m) for m in self.session.exec(select(Mark)).all()]
        if category:
            marks = [m for m in marks if m.category == category]

        scores: dict[str, list[float]] = defaultdict(list)
        for r in self.session.exec(
            select(MarkRanking).where(col(MarkRanking.user_id).in_(group))
        ).all():
            scores[r.mark_id].append(r.score)

        likes: list[str] = []
        dislikes: list[str] = []
        for uid in group:
            p = self.profile("user", uid)
            if p:
                likes += p.likes
                dislikes += p.dislikes
        like_words = {w for phrase in likes for w in phrase.split()}
        dislike_words = {w for phrase in dislikes for w in phrase.split()}

        cands = []
        for m in marks:
            tags = tuple(t for t in m.vibe_tags if t.lower() in like_words)
            if any(t.lower() in dislike_words for t in m.vibe_tags):
                continue
            s = scores.get(m.id, [])
            cands.append(
                SpotCandidate(m, round(sum(s) / len(s), 1) if s else None, len(s), tags)
            )
        return await agent.suggest_spots(
            self.lane.runner,
            user_id,
            cands,
            list(dict.fromkeys(likes)),
            list(dict.fromkeys(dislikes)),
        )
