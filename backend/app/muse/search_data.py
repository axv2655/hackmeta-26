"""Reads behind Muse search (docs/MUSE_SEARCH.md): friends, who to ask, and
places for a group. Deterministic; the scores live in `domain/recommend.py`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, or_, select

from app.domain import recommend
from app.domain.affinity import Target
from app.muse.context import Candidate, load_candidates
from app.tables import Friendship, Mark, MarkRanking, SavedMark, User

LOVED = 7.0
CANDIDATE_MARKS = 40


@dataclass(frozen=True, slots=True)
class PersonView:
    user_id: str
    name: str
    first_name: str
    avatar_url: str
    avatar_color: str
    reason: str


@dataclass(frozen=True, slots=True)
class PlaceView:
    mark_id: str
    name: str
    category: str
    score: float | None
    reason: str


def friend_ids(session: Session, me: str) -> set[str]:
    rows = session.exec(
        select(Friendship).where(or_(Friendship.user_a == me, Friendship.user_b == me))
    ).all()
    return {r.user_b if r.user_a == me else r.user_a for r in rows}


def users(session: Session, ids: Sequence[str]) -> dict[str, User]:
    if not ids:
        return {}
    rows = session.exec(select(User).where(col(User.id).in_(list(ids)))).all()
    return {u.id: u for u in rows}


# --- who to ask ------------------------------------------------------------------


def people_for(
    session: Session, me: str, category: str | None, now: datetime, limit: int = 3
) -> list[PersonView]:
    """Friends most likely in for this kind of thing: affinity (how often you
    meet, recently, for the same category), busy people left out."""
    target = Target(category=category)  # type: ignore[arg-type]
    cands = load_candidates(session, me, friend_ids(session, me), now, target)
    free = [c for c in cands if not c.busy]
    options = [recommend.PersonOption(c.user_id, c.affinity) for c in free]
    picked = recommend.invites(options, force=True, limit=limit)
    by_id = {c.user_id: c for c in free}
    rows = users(session, [p.user_id for p in picked])
    out = []
    for p in picked:
        u = rows.get(p.user_id)
        if u is None:
            continue
        out.append(
            PersonView(
                u.id,
                u.name,
                u.first_name,
                u.avatar_url,
                u.avatar_color,
                _person_reason(by_id[p.user_id], category),
            )
        )
    return out


def _person_reason(c: Candidate, category: str | None) -> str:
    f = c.features
    if category and f.same_category:
        return f"{f.same_category}x {category} together lately"
    if f.hangouts_30d:
        return f"hung out {f.hangouts_30d}x this month"
    if f.hangouts_90d:
        return f"hung out {f.hangouts_90d}x lately"
    if f.is_close_friend:
        return "close friend"
    return "friend on Moves"


# --- places for a group ---------------------------------------------------------


def group_places(
    session: Session,
    me: str,
    group: Sequence[str],
    category: str | None,
    limit: int = 3,
) -> list[PlaceView]:
    """Places best for everyone in `group` (`me` first), by each person's own
    ratings (`recommend.rank_group_places`)."""
    people = list(dict.fromkeys([me, *group]))
    ratings = _ratings(session, people)
    saved = _saved(session, me)
    marks = _candidate_marks(session, category, set(ratings) | saved)
    if not marks:
        return []
    places = [
        recommend.GroupPlace(
            m.id,
            tuple(ratings.get(m.id, {}).get(uid) for uid in people),
            m.id in saved,
        )
        for m in marks
    ]
    names = {u.id: u.first_name for u in users(session, people).values()}
    by_id = {m.id: m for m in marks}
    out = []
    for p in recommend.rank_group_places(places)[:limit]:
        m = by_id[p.mark_id]
        known = [s for s in p.scores if s is not None]
        out.append(
            PlaceView(
                m.id,
                m.name,
                m.category,
                round(sum(known) / len(known), 1) if known else None,
                _place_reason(p, people, me, names, m.category),
            )
        )
    return out


def _ratings(session: Session, people: list[str]) -> dict[str, dict[str, float]]:
    """mark_id -> {user_id: score} for everyone in the group."""
    rows = session.exec(
        select(MarkRanking).where(col(MarkRanking.user_id).in_(people))
    ).all()
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        out.setdefault(r.mark_id, {})[r.user_id] = r.score
    return out


def _saved(session: Session, me: str) -> set[str]:
    rows = session.exec(select(SavedMark.mark_id).where(SavedMark.user_id == me))
    return set(rows.all())


def _candidate_marks(
    session: Session, category: str | None, known: set[str]
) -> list[Mark]:
    """Marks the group rated or the user saved (in the category, if one), then
    other Marks in the category so there is always something to suggest."""
    query = select(Mark)
    if category:
        query = query.where(Mark.category == category)
    rows = session.exec(query.order_by(col(Mark.name), col(Mark.id))).all()
    first = [m for m in rows if m.id in known]
    rest = [m for m in rows if m.id not in known] if category else []
    return (first + rest)[:CANDIDATE_MARKS]


def _place_reason(
    p: recommend.GroupPlace,
    people: list[str],
    me: str,
    names: dict[str, str],
    category: str,
) -> str:
    parts = []
    for uid, score in zip(people, p.scores, strict=True):
        if score is None:
            continue
        who = "you" if uid == me else names.get(uid, "a friend")
        parts.append(
            f"{who} loved it" if score >= LOVED else f"{who} rated it {score:.1f}"
        )
    if parts:
        return " · ".join(parts[:2])
    if p.saved:
        return "you saved it"
    return f"a {category} spot to try"
