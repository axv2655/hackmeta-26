"""Muse search planner (docs/MUSE_SEARCH.md): one prompt -> one `SearchPlan`.

The map's search box sends what the user typed. Muse is asked once (even in
deterministic mode: the user asked for it) to say what they want:

- `move`: draft a Move (`text`), only for `people` when they named anyone,
  at `place` if they named one, or at a spot Muse picks (`pick_place`);
- `who`: suggest friends for an activity;
- `where`: suggest places (for the user plus `people`);
- `clarify`: Muse cannot tell; `question` says what to ask.

Muse only plans. Names are resolved, places ranked and drafts held by the
server (`services/muse_search.py`); nothing posts without the user's tap.
The fallback is a keyword parser, so the search works with Muse down.
"""

from __future__ import annotations

import re
from typing import Literal, get_args

from pydantic import BaseModel, Field

from app.muse.agents.move_writer import MAX_LEN, normalize
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import Category

AGENT = "muse_search"
MAX_TOKENS = 250
MAX_PEOPLE = 8
CATEGORIES: tuple[str, ...] = get_args(Category)
SELF = {"me", "i", "myself", "us", "we", "my", "mine"}

Action = Literal["move", "who", "where", "clarify"]


class SearchPlan(BaseModel):
    action: Action = "move"
    text: str = ""
    category: str | None = None
    people: list[str] = Field(default_factory=list)
    place: str | None = None
    pick_place: bool = False
    question: str = ""
    message: str = ""


# --- keyword fallback -----------------------------------------------------------

KEYWORDS: dict[str, tuple[str, ...]] = {
    "fitness": (
        "run",
        "running",
        "jog",
        "gym",
        "lift",
        "workout",
        "work out",
        "climb",
        "climbing",
        "pickleball",
        "tennis",
        "basketball",
        "hoop",
        "yoga",
        "swim",
    ),
    "coffee": ("coffee", "matcha", "boba", "tea", "latte", "cafe", "espresso"),
    "food": (
        "eat",
        "food",
        "lunch",
        "dinner",
        "breakfast",
        "brunch",
        "tacos",
        "pizza",
        "sushi",
        "ramen",
        "burger",
        "snack",
        "hungry",
    ),
    "study": ("study", "library", "homework", "pset", "lock in", "cram"),
    "nightlife": ("bar", "drinks", "party", "club", "karaoke"),
    "outdoors": ("hike", "hiking", "park", "beach", "walk", "bike"),
    "games": ("games", "gaming", "board game", "poker", "smash"),
    "shopping": ("shop", "shopping", "mall", "thrift"),
    "errand": ("errand", "groceries", "grocery", "target", "costco"),
}
WHO = re.compile(r"\b(who'?s|who\s+(wants|is|would|should|can)|anyone)\b", re.I)
WHERE = re.compile(
    r"\b(where|what'?s\s+(a|the)\s+good|best|top|favorite|recommend)\b", re.I
)
NAMES = r"(@?[a-z][\w.'-]*(?:\s*(?:,|&|\band\b)\s*@?[a-z][\w.'-]*)*)"
PEOPLE_PATTERNS = (
    re.compile(
        rf"\b(?:tell|ask|ping|invite|text|message|let)\s+(?:me\s+and\s+)?{NAMES}",
        re.I,
    ),
    re.compile(rf"\b(?:bring|take|get)\s+me\s+and\s+{NAMES}", re.I),
    re.compile(rf"\b(?:with|for)\s+{NAMES}", re.I),
    re.compile(rf"\bme\s+and\s+{NAMES}", re.I),
)
STOP = {
    "that",
    "to",
    "i",
    "im",
    "i'm",
    "we",
    "if",
    "know",
    "go",
    "get",
    "a",
    "the",
    "some",
    "on",
    "for",
    "me",
    "us",
    "want",
    "wants",
    "going",
    "eat",
    "grab",
    "dinner",
    "lunch",
    "coffee",
    "run",
    "should",
    "about",
} | set(CATEGORIES)
PLACE = re.compile(r"\b(?:at|to)\s+([A-Z][\w'&.-]*(?:\s+[A-Z0-9][\w'&.-]*)*)")
FILLER = re.compile(
    r"^(?:\W*(?:that|i\s+want\s+to|i\s+wanna|i'?m|i\s+am|we\s+should|let'?s|"
    r"to|and|so|should|wants?\s+to|do\s+you\s+want\s+to)\b)+",
    re.I,
)


def category_of(text: str) -> str | None:
    low = f" {text.lower()} "
    for cat, words in KEYWORDS.items():
        if any(re.search(rf"\b{re.escape(w)}\b", low) for w in words):
            return cat
    return None


def people_in(text: str) -> tuple[list[str], str]:
    """Names the user mentioned, and the text with those phrases removed."""
    names: list[str] = []
    rest = text
    for pattern in PEOPLE_PATTERNS:
        for m in pattern.finditer(text):
            found = [
                n.strip(" ,.'") for n in re.split(r"\s*(?:,|&|\band\b)\s*", m.group(1))
            ]
            kept = [n for n in found if n and n.lower() not in STOP | SELF]
            if kept:
                names += kept
                rest = rest.replace(m.group(0), " ")
    return list(dict.fromkeys(names))[:MAX_PEOPLE], rest


def activity(rest: str) -> str:
    text = re.sub(r"[?!.]+$", "", rest).strip()
    text = FILLER.sub("", text).strip(" ,.")
    text = normalize(text)
    if len(text) >= MAX_LEN:
        text = text[: MAX_LEN - 1].rsplit(" ", 1)[0]
    return text


def heuristic(said: str) -> SearchPlan:
    category = category_of(said)
    if WHO.search(said):
        _, rest = people_in(said)
        text = activity(WHO.sub(" ", rest).replace("wants to", " "))
        return SearchPlan(action="who", text=text, category=category)
    people, rest = people_in(said)
    place = PLACE.search(said)
    if WHERE.search(said) and not re.search(r"\b(tell|ask|ping|invite)\b", said, re.I):
        return SearchPlan(action="where", category=category, people=people)
    text = activity(PLACE.sub(" ", rest) if place else rest)
    vague = category is None and not people and not place and len(text.split()) < 2
    if vague or (not text and category is None):
        return SearchPlan(
            action="clarify", people=people, question="What do you want to do?"
        )
    return SearchPlan(
        action="move",
        text=text,
        category=category,
        people=people,
        place=place.group(1) if place else None,
        pick_place=place is None and category is not None and bool(people),
    )


# --- Muse ----------------------------------------------------------------------


def check(out: SearchPlan) -> SearchPlan:
    category = out.category if out.category in CATEGORIES else None
    people = [
        p.strip() for p in out.people if p.strip() and p.strip().lower() not in SELF
    ][:MAX_PEOPLE]
    text = normalize(out.text)
    if len(text) >= MAX_LEN:
        text = text[: MAX_LEN - 1].rsplit(" ", 1)[0]
    if out.action == "move" and not text and category is None:
        raise AgentRejected("a move needs text or a category")
    if out.action == "clarify" and not out.question.strip():
        raise AgentRejected("clarify needs a question")
    place = (out.place or "").strip() or None
    return out.model_copy(
        update={
            "category": category,
            "people": people,
            "text": text,
            "place": place,
            "pick_place": out.pick_place and place is None,
            "message": out.message.strip()[:140],
        }
    )


async def plan(runner: MuseRunner, user_id: str, said: str) -> tuple[SearchPlan, bool]:
    """The plan, and whether it came from the keyword fallback."""
    said = " ".join(said.split())[:300]
    return await runner.run_agent_meta(
        AGENT,
        user_id,
        f"User: {said}",
        SearchPlan,
        lambda: heuristic(said),
        max_tokens=MAX_TOKENS,
        check=check,
        live=True,
    )
