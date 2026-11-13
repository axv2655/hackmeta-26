"""Move ranker (ARCHITECTURE.md 10.5): order the visible live Moves, with a
one-line reason for the "For you" strip.

Deterministic, no model call: every Move becomes `MoveFacts` and
`domain.move_ranking.rank` orders them by binary pairwise comparison. The
facts come from what the server already knows about the viewer:

- people: affinity to everyone on the Move (`load_candidates`: how often you
  hang out, recently, at the same kind of place, how often you pull up);
- place: the viewer's own Beli-style score for the Mark (`mark_rankings`);
- taste: the Move's category or the Mark's vibe tags in the viewer's taste
  profile;
- the fill timer, how many are going, and how new it is.

Every input Move appears exactly once. The reason names the factor that did
the most for that Move ("Tony + Priya", "you loved Kumo", "8 min to join").
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, select

from app.domain import move_ranking
from app.domain.move_ranking import MoveFacts
from app.muse.context import load_candidates
from app.muse.lane import MuseLane
from app.ports import MoveSnapshot, RankedMove
from app.tables import MarkRanking, TasteProfile

AGENT = "move_ranker"
LOVED = 7.0  # Beli "Loved" band starts here (domain/ranking.py)


def _people(move: MoveSnapshot, viewer_id: str) -> list[str]:
    ids = [
        move.creator_id,
        *(p.user_id for p in move.participants if p.status != "left"),
    ]
    return [uid for uid in dict.fromkeys(ids) if uid != viewer_id]


def names_reason(
    move: MoveSnapshot, viewer_id: str, scores: dict[str, float], names: dict[str, str]
) -> str:
    """The closest people on the Move, "Tony + Priya" or "Tony + Priya + 2"."""
    close = [u for u in _people(move, viewer_id) if scores.get(u, -99.0) > 0]
    close.sort(key=lambda u: (-scores[u], u))
    if not close:
        return ""
    shown = " + ".join(names.get(u, "a friend") for u in close[:2])
    more = len(close) - 2
    return f"{shown} + {more}" if more > 0 else shown


@dataclass(frozen=True)
class Context:
    """Everything the comparison needs about one viewer, loaded once."""

    viewer_id: str
    now: datetime
    scores: dict[str, float]
    names: dict[str, str]
    place_scores: dict[str, float]
    likes: frozenset[str]


def load_context(
    session: Session,
    viewer_id: str,
    moves: Sequence[MoveSnapshot],
    now: datetime,
    extra_likes: Collection[str] = (),
) -> Context:
    everyone = {u for m in moves for u in _people(m, viewer_id)}
    cands = load_candidates(session, viewer_id, everyone, now)
    return Context(
        viewer_id=viewer_id,
        now=now,
        scores={c.user_id: c.affinity for c in cands},
        names={c.user_id: c.first_name for c in cands},
        place_scores=_place_scores(session, viewer_id, {m.mark.id for m in moves}),
        likes=frozenset(taste_words(session, viewer_id) | set(extra_likes)),
    )


def facts(move: MoveSnapshot, ctx: Context) -> MoveFacts:
    people = _people(move, ctx.viewer_id)
    known = [ctx.scores[u] for u in people if u in ctx.scores]
    fits = move.category in ctx.likes or bool(set(move.mark.vibe_tags) & ctx.likes)
    minutes_left = None
    if move.fill_deadline is not None:
        minutes_left = max(0, int((move.fill_deadline - ctx.now).total_seconds() // 60))
    return MoveFacts(
        move_id=move.id,
        best_affinity=max(known) if known else None,
        close_count=sum(1 for s in known if s > 0),
        going=len(people),
        place_score=ctx.place_scores.get(move.mark.id),
        taste_fit=fits,
        minutes_left=minutes_left,
        age_minutes=max(0, int((ctx.now - move.created_at).total_seconds() // 60)),
    )


def reason(move: MoveSnapshot, f: MoveFacts, ctx: Context) -> str:
    """One short line for the factor that did the most for this Move."""
    names = names_reason(move, ctx.viewer_id, ctx.scores, ctx.names)
    top = move_ranking.top_factor(f)
    if top in ("people", "crowd") and names:
        return names
    if top == "place" and f.place_score is not None:
        if f.place_score >= LOVED:
            return f"you loved {move.mark.name}"
        return f"you rated {move.mark.name} {f.place_score:.1f}"
    if top == "taste":
        return f"your kind of {move.category}"
    if top == "urgency" and f.minutes_left is not None:
        return f"{f.minutes_left} min to join"
    if top == "momentum" and f.going > 1:
        return f"{f.going} going"
    if top == "fresh":
        return "just posted"
    return names


def rank_snapshots(
    session: Session,
    viewer_id: str,
    moves: Sequence[MoveSnapshot],
    now: datetime,
    extra_likes: Collection[str] = (),
) -> list[RankedMove]:
    """The viewer's Moves, best first, each with its reason."""
    if not moves:
        return []
    ctx = load_context(session, viewer_id, moves, now, extra_likes)
    by_id = {m.id: m for m in moves}
    by_facts = {m.id: facts(m, ctx) for m in by_id.values()}
    ordered = move_ranking.rank(by_facts.values())
    return [RankedMove(f.move_id, reason(by_id[f.move_id], f, ctx)) for f in ordered]


@dataclass
class MoveRanker:
    """`MuseGateway.rank_moves`: deterministic, answers at once."""

    lane: MuseLane

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]:
        if not moves:
            return []
        with self.lane.session() as session:
            return rank_snapshots(session, viewer_id, list(moves), self.lane.now())

    async def settle(self) -> None:
        """Nothing runs in the background any more (kept for callers)."""


def _place_scores(
    session: Session, viewer_id: str, mark_ids: Collection[str]
) -> dict[str, float]:
    if not mark_ids:
        return {}
    rows = session.exec(
        select(MarkRanking).where(
            MarkRanking.user_id == viewer_id, col(MarkRanking.mark_id).in_(mark_ids)
        )
    ).all()
    return {r.mark_id: r.score for r in rows}


def taste_words(session: Session, user_id: str) -> set[str]:
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
