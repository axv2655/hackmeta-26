"""Place resolver (ARCHITECTURE.md 10.4): which Mark is this content about?

Inputs: a geotag, a caption (or utterance), an optional video frame, and up
to 10 nearest candidate Marks. Output: a `PlaceResolution`. Confidence below
0.6 means the UI asks "Is this X?" (`needs_confirmation`).

- A geotag is trusted outright (no Muse call).
- The frame is sent only when Muse has vision; otherwise text only.
- Fallback: caption words against Mark names, then the nearest Mark at low
  confidence, else nothing.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.muse.context import MAX_MARKS, AliasBook
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import Category, MarkSnapshot, NewMarkDraft, PlaceResolution

AGENT = "place_resolver"
MAX_TOKENS = 150
CONFIRM_BELOW = 0.6
GEOTAG_CONFIDENCE = 0.95
NEAREST_CONFIDENCE = 0.3
STOPWORDS = {"the", "a", "an", "at", "and", "of", "cafe", "shop", "co"}


class NewMark(BaseModel):
    name: str
    category: Category = "other"
    vibe_tags: list[str] = Field(default_factory=list)


class ResolverOut(BaseModel):
    mark: str | None = None
    new_mark: NewMark | None = None
    confidence: float = Field(ge=0.0, le=1.0)


@dataclass(frozen=True)
class ResolveInput:
    user_id: str
    candidates: Sequence[MarkSnapshot]
    geotag: MarkSnapshot | None = None
    caption: str | None = None
    frame_url: str | None = None


def needs_confirmation(res: PlaceResolution) -> bool:
    return res.mark_id is not None and res.confidence < CONFIRM_BELOW


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS}


def heuristic(inp: ResolveInput) -> PlaceResolution:
    if inp.geotag is not None:
        return PlaceResolution(inp.geotag.id, GEOTAG_CONFIDENCE)
    if inp.caption:
        said = _words(inp.caption)
        best, best_score = None, 0.0
        for mark in inp.candidates:
            name = _words(mark.name)
            if name:
                score = len(name & said) / len(name)
                if score > best_score:
                    best, best_score = mark, score
        if best is not None and best_score >= 0.5:
            return PlaceResolution(best.id, round(0.5 + 0.4 * best_score, 2))
    if inp.candidates:
        return PlaceResolution(inp.candidates[0].id, NEAREST_CONFIDENCE)
    return PlaceResolution(None, 0.0)


async def resolve(runner: MuseRunner, inp: ResolveInput) -> PlaceResolution:
    if inp.geotag is not None:
        return heuristic(inp)
    if not inp.caption and not (inp.frame_url and runner.supports_vision):
        return heuristic(inp)

    book = AliasBook("k")
    rows = []
    for mark in inp.candidates[:MAX_MARKS]:
        alias = book.alias(mark.id, mark.name)
        tags = ", ".join(mark.vibe_tags) or "-"
        rows.append(f"{alias} | {mark.name} | {mark.category} | {tags}")
    prompt = "\n".join(
        [
            f"Content caption: {inp.caption or '(none)'}",
            "Candidates (nearest first):",
            *(rows or ["(none)"]),
        ]
    )

    def check(out: ResolverOut) -> ResolverOut:
        if out.mark is not None and book.id_of(out.mark) is None:
            raise AgentRejected(f"unknown mark alias {out.mark!r}")
        return out

    def fallback() -> ResolverOut:
        res = heuristic(inp)
        alias = book.alias(res.mark_id) if res.mark_id else None
        return ResolverOut(mark=alias, confidence=res.confidence)

    out = await runner.run_agent(
        AGENT,
        inp.user_id,
        prompt,
        ResolverOut,
        fallback,
        images=[inp.frame_url] if inp.frame_url else None,
        max_tokens=MAX_TOKENS,
        check=check,
    )
    mark_id = book.id_of(out.mark)
    if mark_id is not None:
        return PlaceResolution(mark_id, out.confidence)
    if out.new_mark is not None:
        nm = out.new_mark
        return PlaceResolution(
            None,
            out.confidence,
            NewMarkDraft(nm.name.strip(), nm.category, tuple(nm.vibe_tags[:3])),
        )
    return PlaceResolution(None, out.confidence)
