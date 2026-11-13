"""Move writer (ARCHITECTURE.md 10.4): the one-line text of a Move.

Lowercase, casual, under 60 characters, plus 3 alternates. The fallback is a
template per category, so the composer always has something instantly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import get_args

from pydantic import BaseModel, Field

from app.domain.affinity import clock_label, hour_bucket, local
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import Category, MarkSnapshot

AGENT = "move_writer"
MAX_TOKENS = 150
MAX_LEN = 60
CATEGORIES: tuple[str, ...] = get_args(Category)

TEMPLATES: dict[str, tuple[str, ...]] = {
    "coffee": (
        "getting coffee at {m}, who's down?",
        "{m} run, come thru",
        "coffee break at {m}?",
        "caffeine at {m} rn",
    ),
    "food": (
        "grabbing food at {m}, who's down?",
        "eating at {m} rn, pull up",
        "{m} for lunch?",
        "hungry? {m} rn",
    ),
    "study": (
        "studying at {m}, come lock in",
        "{m} study sesh, pull up",
        "library grind at {m}",
        "quiet study at {m} rn",
    ),
    "fitness": (
        "working out at {m}, who's in?",
        "{m} session, come thru",
        "getting a lift in at {m}",
        "sweat at {m}?",
    ),
    "nightlife": (
        "out at {m} tonight, pull up",
        "{m} later, who's down?",
        "night out at {m}",
        "vibes at {m} rn",
    ),
    "outdoors": (
        "outside at {m}, come hang",
        "{m} walk, who's in?",
        "sun at {m} rn",
        "chilling at {m}",
    ),
    "games": (
        "games at {m}, who's in?",
        "{m} game night, pull up",
        "playing at {m} rn",
        "need one more at {m}",
    ),
    "shopping": (
        "shopping at {m}, who's down?",
        "{m} run, come thru",
        "browsing {m} rn",
        "quick stop at {m}",
    ),
    "errand": (
        "running errands at {m}",
        "{m} run, need anything?",
        "quick trip to {m}",
        "at {m} for a sec",
    ),
    "other": (
        "at {m} rn, who's down?",
        "pull up to {m}",
        "hanging at {m}",
        "come thru {m}",
    ),
}

KEYWORDS: dict[str, tuple[str, ...]] = {
    "coffee": ("coffee", "matcha", "latte", "boba", "tea", "cafe", "espresso"),
    "food": ("lunch", "dinner", "food", "eat", "tacos", "pizza", "brunch", "ramen"),
    "study": ("study", "library", "homework", "exam", "lock in"),
    "fitness": ("gym", "climb", "lift", "run", "pickleball", "basketball", "yoga"),
    "nightlife": ("bar", "party", "club", "drinks"),
    "outdoors": ("hike", "park", "walk", "lake", "trail"),
    "games": ("game", "board game", "arcade", "smash", "poker"),
    "shopping": ("shop", "mall", "thrift", "target"),
    "errand": ("errand", "groceries", "pharmacy", "laundry"),
}


class WriterOut(BaseModel):
    text: str
    category: Category = "other"
    alternates: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class WriterInput:
    user_id: str
    mark: MarkSnapshot | None
    when: datetime
    category: Category | None = None
    taste: str = ""
    seed_text: str | None = None


def normalize(text: str) -> str:
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip().strip('"').lower()
    return text.rstrip(".")


def short_name(name: str, room: int = 24) -> str:
    name = name.strip()
    return name if len(name) <= room else name[: room - 1].rstrip() + "…"


def guess_category(text: str | None) -> Category | None:
    if not text:
        return None
    lowered = text.lower()
    for category, words in KEYWORDS.items():
        if any(w in lowered for w in words):
            return category  # type: ignore[return-value]
    return None


def fallback(inp: WriterInput) -> WriterOut:
    category: Category = (
        inp.category
        or (inp.mark.category if inp.mark else None)
        or guess_category(inp.seed_text)
        or "other"
    )
    name = short_name(inp.mark.name) if inp.mark else "here"
    lines = [t.format(m=name.lower()) for t in TEMPLATES[category]]
    if inp.seed_text:
        seed = normalize(inp.seed_text)
        if 0 < len(seed) < MAX_LEN:
            lines.insert(0, seed)
    lines = [line for line in dict.fromkeys(lines) if len(line) < MAX_LEN]
    return WriterOut(text=lines[0], category=category, alternates=lines[1:4])


def check(out: WriterOut, inp: WriterInput) -> WriterOut:
    text = normalize(out.text)
    if not text or len(text) >= MAX_LEN:
        raise AgentRejected(f"text must be 1 to {MAX_LEN - 1} characters")
    alternates = [normalize(a) for a in out.alternates]
    alternates = [a for a in dict.fromkeys(alternates) if a and a != text]
    alternates = [a for a in alternates if len(a) < MAX_LEN][:3]
    for extra in fallback(inp).alternates + [fallback(inp).text]:
        if len(alternates) >= 3:
            break
        if extra != text and extra not in alternates:
            alternates.append(extra)
    return WriterOut(text=text, category=out.category, alternates=alternates)


def render(inp: WriterInput) -> str:
    t = local(inp.when)
    mark = inp.mark
    tags = ", ".join(mark.vibe_tags) if mark and mark.vibe_tags else "no tags"
    lines = [
        f"Place: {mark.name} ({mark.category}; {tags})" if mark else "Place: none yet",
        f"Time: {t.strftime('%a')} {clock_label(inp.when)} ({hour_bucket(inp.when)})",
        f"Poster's taste: {inp.taste or 'unknown'}",
        f"Seed text: {inp.seed_text or 'none'}",
    ]
    if inp.category:
        lines.append(f"Category: {inp.category}")
    return "\n".join(lines)


async def write(runner: MuseRunner, inp: WriterInput) -> WriterOut:
    out, _ = await write_meta(runner, inp)
    return out


async def write_meta(runner: MuseRunner, inp: WriterInput) -> tuple[WriterOut, bool]:
    """The written line, plus whether the template fallback produced it.

    Slow timeout (20 s): Muse thinks before answering; the composer already
    shows the instant heuristic draft while this runs."""
    return await runner.run_agent_meta(
        AGENT,
        inp.user_id,
        render(inp),
        WriterOut,
        lambda: fallback(inp),
        max_tokens=MAX_TOKENS,
        check=lambda out: check(out, inp),
        slow=True,
    )
