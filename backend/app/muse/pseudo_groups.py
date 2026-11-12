"""Pseudo-group refresh: detect clusters and upsert `pseudo_groups` rows.

`upsert(owner_id)` is synchronous and uses fallback labels ("coffee crew"),
so the seed can run it on a plain session. `refresh(owner_id)` also asks
Muse to label groups that do not have a Muse label yet.

Rows are matched by member set, so a group keeps its id (and its taste
profile) across refreshes; a group that is no longer detected is removed.
`member_ids` excludes the owner. A row is (re)labelled by Muse while its
label is still the fallback form.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlmodel import Session, col, or_, select

from app.domain import pseudo_groups as pg
from app.muse.lane import MuseLane
from app.ports import Clock
from app.tables import Hangout, PseudoGroup

LABEL_AGENT = "pseudo_group_label"
LABEL_MAX_TOKENS = 60


class LabelOut(BaseModel):
    label: str = Field(min_length=2, max_length=40)


def owner_outings(session: Session, owner_id: str) -> list[pg.Outing]:
    mine = session.exec(
        select(Hangout.move_id).where(
            or_(Hangout.user_a == owner_id, Hangout.user_b == owner_id)
        )
    ).all()
    if not mine:
        return []
    rows = session.exec(
        select(Hangout).where(col(Hangout.move_id).in_(set(mine)))
    ).all()
    return pg.outings(owner_id, rows)


def upsert(
    session: Session, owner_id: str, now: datetime
) -> list[tuple[PseudoGroup, pg.Cluster]]:
    clusters = pg.detect(owner_id, owner_outings(session, owner_id), now)
    existing = {
        tuple(sorted(set(row.member_ids) - {owner_id})): row
        for row in session.exec(
            select(PseudoGroup).where(PseudoGroup.owner_id == owner_id)
        ).all()
    }
    out = []
    for c in clusters:
        row = existing.pop(c.key, None) or PseudoGroup(
            owner_id=owner_id, label=pg.fallback_label(c.pattern)
        )
        row.member_ids = sorted(c.members)
        row.pattern = c.pattern
        row.strength = c.strength
        row.last_hangout_at = c.last_at
        row.fading = c.fading
        session.add(row)
        out.append((row, c))
    for stale in existing.values():
        session.delete(stale)
    session.flush()
    return out


def seed_all(session: Session, clock: Clock, owner_ids: list[str]) -> int:
    now = clock.now()
    return sum(len(upsert(session, owner, now)) for owner in owner_ids)


class PseudoGroupService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane

    async def refresh(self, owner_id: str) -> list[tuple[PseudoGroup, pg.Cluster]]:
        pairs = upsert(self.session, owner_id, self.lane.now())
        for row, cluster in pairs:
            if row.label == pg.fallback_label(cluster.pattern):
                row.label = await self._label(owner_id, row, cluster)
                self.session.add(row)
        self.session.commit()
        return pairs

    async def _label(self, owner_id: str, row: PseudoGroup, c: pg.Cluster) -> str:
        p = c.pattern
        prompt = (
            f"Group of {len(c.members) + 1}. Categories: {', '.join(p['categories'])}. "
            f"When: {pg.describe_when(p) or 'varies'}, {', '.join(p['hour_buckets'])}. "
            f"Times together: {len(c.outings)}."
        )
        out = await self.lane.runner.run_agent(
            LABEL_AGENT,
            owner_id,
            prompt,
            LabelOut,
            lambda: LabelOut(label=row.label),
            max_tokens=LABEL_MAX_TOKENS,
        )
        return " ".join(out.label.split()).lower()

    def owned(self, owner_id: str) -> list[PseudoGroup]:
        return list(
            self.session.exec(
                select(PseudoGroup)
                .where(PseudoGroup.owner_id == owner_id)
                .order_by(col(PseudoGroup.strength).desc())
            ).all()
        )

    def history(self, row: PseudoGroup) -> list[int]:
        members = set(row.member_ids)
        times = [
            o.at
            for o in owner_outings(self.session, row.owner_id)
            if members <= o.people and len(o.people - members) <= 1
        ]
        return pg.weekly_history(times, self.lane.now())
