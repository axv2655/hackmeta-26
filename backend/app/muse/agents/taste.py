"""Taste learning and spot suggestions (ARCHITECTURE.md 10.7).

`update_profile`: previous profile + new ratings -> `{summary, likes,
dislikes}`. The output is always valid, even on fallback: a non-empty
lowercase summary and short, de-duplicated lists.

`suggest_spots`: 3 Marks for a group with a reason each. Fallback: the
group's rankings plus shared vibe tags.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.muse.context import MAX_MARKS, AliasBook
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import MarkSnapshot

AGENT = "taste"
SPOTS_AGENT = "suggest_spots"
MAX_TOKENS = 300
SPOTS_MAX_TOKENS = 300
MAX_LIKES = 6
MAX_DISLIKES = 4
SPOTS = 3


class TasteOut(BaseModel):
    summary: str = ""
    likes: list[str] = Field(default_factory=list)
    dislikes: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class RatingFact:
    stars: int
    vibe_tags: tuple[str, ...]
    note: str
    mark_name: str
    category: str
    mark_tags: tuple[str, ...] = ()


def _clean(items: Sequence[str], limit: int) -> list[str]:
    out = [" ".join(i.split()).strip(" .,").lower() for i in items]
    return [i for i in dict.fromkeys(out) if i and len(i) <= 60][:limit]


def summarize(likes: Sequence[str], dislikes: Sequence[str]) -> str:
    if not likes and not dislikes:
        return "still learning what you like"
    text = f"likes {', '.join(likes[:3])}" if likes else "picky so far"
    if dislikes:
        text += f"; not into {', '.join(dislikes[:2])}"
    return text


def valid(out: TasteOut) -> TasteOut:
    likes = _clean(out.likes, MAX_LIKES)
    dislikes = [d for d in _clean(out.dislikes, MAX_DISLIKES) if d not in likes]
    summary = " ".join(out.summary.split()).strip().lower()[:140]
    return TasteOut(
        summary=summary or summarize(likes, dislikes), likes=likes, dislikes=dislikes
    )


def fallback_profile(prev: TasteOut | None, ratings: Sequence[RatingFact]) -> TasteOut:
    likes = list(prev.likes) if prev else []
    dislikes = list(prev.dislikes) if prev else []
    for r in ratings:
        phrases = [*r.vibe_tags, *r.mark_tags[:2]]
        if r.stars >= 4:
            new = [*phrases, f"{r.category} spots"]
            likes = new + [x for x in likes if x not in new]
            dislikes = [d for d in dislikes if d not in new]
        elif r.stars <= 2:
            new = list(r.vibe_tags) or [f"{r.mark_name}"]
            dislikes = new + [x for x in dislikes if x not in new]
            likes = [x for x in likes if x not in new]
    likes, dislikes = _clean(likes, MAX_LIKES), _clean(dislikes, MAX_DISLIKES)
    return valid(
        TasteOut(summary=summarize(likes, dislikes), likes=likes, dislikes=dislikes)
    )


def _check(out: TasteOut) -> TasteOut:
    if not out.summary.strip():
        raise AgentRejected("empty summary")
    return valid(out)


async def update_profile(
    runner: MuseRunner,
    user_id: str | None,
    subject: str,
    prev: TasteOut | None,
    ratings: Sequence[RatingFact],
) -> TasteOut:
    rows = [
        f"- {r.stars}/5 at a {r.category} place ({', '.join(r.mark_tags) or 'no tags'})"
        f"; picked: {', '.join(r.vibe_tags) or '-'}; note: {r.note or '-'}"
        for r in ratings
    ]
    prompt = "\n".join(
        [
            f"Subject: {subject}",
            f"Previous summary: {prev.summary if prev else '(none)'}",
            f"Previous likes: {', '.join(prev.likes) if prev else '-'}",
            f"Previous dislikes: {', '.join(prev.dislikes) if prev else '-'}",
            "New ratings:",
            *rows,
        ]
    )
    return await runner.run_agent(
        AGENT,
        user_id,
        prompt,
        TasteOut,
        lambda: fallback_profile(prev, ratings),
        max_tokens=MAX_TOKENS,
        slow=True,
        check=_check,
    )


# --- suggest-spots ------------------------------------------------------------


class SpotItem(BaseModel):
    mark: str
    reason: str = ""


class SpotsOut(BaseModel):
    spots: list[SpotItem] = Field(default_factory=list)


@dataclass(frozen=True)
class SpotCandidate:
    mark: MarkSnapshot
    avg_score: float | None
    raters: int
    tag_match: tuple[str, ...]

    @property
    def heuristic(self) -> float:
        return (self.avg_score or 0.0) + 2 * len(self.tag_match) + 0.5 * self.raters


def spot_reason(c: SpotCandidate) -> str:
    if c.avg_score is not None:
        who = "you all" if c.raters > 1 else "you"
        return f"{who} rated it {c.avg_score:.1f}"
    if c.tag_match:
        return f"your vibe: {', '.join(c.tag_match[:2])}"
    return f"{c.mark.category} spot, new to you"


async def suggest_spots(
    runner: MuseRunner,
    user_id: str,
    candidates: Sequence[SpotCandidate],
    likes: Sequence[str],
    dislikes: Sequence[str],
) -> list[tuple[MarkSnapshot, str]]:
    ranked = sorted(candidates, key=lambda c: (-c.heuristic, c.mark.id))[:MAX_MARKS]
    if not ranked:
        return []
    book = AliasBook("k")
    rows = [
        f"{book.alias(c.mark.id, c.mark.name)} | {c.mark.name} | {c.mark.category} | "
        f"{', '.join(c.mark.vibe_tags) or '-'} | "
        f"{'-' if c.avg_score is None else f'{c.avg_score:.1f}'} | {c.raters}"
        for c in ranked
    ]
    prompt = "\n".join(
        [
            f"Group likes: {', '.join(likes) or '-'}",
            f"Group dislikes: {', '.join(dislikes) or '-'}",
            "Candidates:",
            *rows,
        ]
    )
    by_id = {c.mark.id: c for c in ranked}

    def fallback() -> SpotsOut:
        return SpotsOut(
            spots=[
                SpotItem(mark=book.alias(c.mark.id), reason=spot_reason(c))
                for c in ranked[:SPOTS]
            ]
        )

    def check(out: SpotsOut) -> SpotsOut:
        if not any(book.id_of(s.mark) in by_id for s in out.spots):
            raise AgentRejected("no known places")
        return out

    out = await runner.run_agent(
        SPOTS_AGENT,
        user_id,
        prompt,
        SpotsOut,
        fallback,
        max_tokens=SPOTS_MAX_TOKENS,
        slow=True,
        check=check,
    )
    picked: list[tuple[MarkSnapshot, str]] = []
    seen: set[str] = set()
    for s in out.spots:
        mid = book.id_of(s.mark)
        if mid in by_id and mid not in seen:
            seen.add(mid)
            picked.append(
                (by_id[mid].mark, book.restore(s.reason) or spot_reason(by_id[mid]))
            )
    for c in ranked:
        if len(picked) >= SPOTS:
            break
        if c.mark.id not in seen:
            seen.add(c.mark.id)
            picked.append((c.mark, spot_reason(c)))
    return picked[:SPOTS]
