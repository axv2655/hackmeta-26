"""Intent parser (ARCHITECTURE.md 10.11): a spoken command -> `Intent`.

"Hey Meta, start a Move, getting boba, ask the usual crew"
    -> start_move, text "getting boba", audience_hint "usual crew"

Fallback: keyword heuristics, so the glasses flow works with Muse down.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from app.muse.agents.move_writer import MAX_LEN, normalize
from app.muse.runner import AgentRejected, MuseRunner
from app.ports import Intent

AGENT = "intent"
MAX_TOKENS = 120

WAKE = re.compile(r"^\s*(hey|ok|okay)\s+meta\b[\s,.!]*", re.IGNORECASE)
START = re.compile(
    r"\b(start|post|share|make|create|send|drop|put out)\s+(a\s+|an\s+)?"
    r"(new\s+)?(move|flare)\b[\s,.:!-]*",
    re.IGNORECASE,
)
CASUAL_START = re.compile(
    r"\b(who'?s down|pull up|come thru|come through|anyone want to|"
    r"i'?m (getting|grabbing|going|heading|at)|let'?s (go|get|grab|hit))\b",
    re.IGNORECASE,
)
AUDIENCE = re.compile(
    r"[\s,.;-]*\b(?:and\s+)?(?:ask|invite|tell|ping|nudge|text|send it to|with)\s+"
    r"(?:the\s+|my\s+)?(.+?)[\s.!?]*$",
    re.IGNORECASE,
)


class IntentOut(BaseModel):
    intent: Literal["start_move", "none"]
    text: str = ""
    audience_hint: str | None = None


def heuristic(utterance: str) -> Intent:
    said = WAKE.sub("", utterance).strip()
    starts = bool(START.search(said) or CASUAL_START.search(said))
    if not starts:
        return Intent(intent="none", text=utterance.strip())
    body = START.sub(" ", said)
    hint = None
    m = AUDIENCE.search(body)
    if m:
        hint = normalize(m.group(1)) or None
        body = body[: m.start()]
    text = normalize(re.sub(r"^[\s,.:;!-]+|[\s,.:;!-]+$", "", body))
    if len(text) >= MAX_LEN:
        text = text[: MAX_LEN - 1].rsplit(" ", 1)[0]
    return Intent(intent="start_move", text=text, audience_hint=hint)


def _check(out: IntentOut) -> IntentOut:
    if out.intent == "start_move":
        text = normalize(out.text)
        if not text or len(text) >= MAX_LEN:
            raise AgentRejected("start_move needs a short text")
        hint = normalize(out.audience_hint) if out.audience_hint else None
        return IntentOut(intent="start_move", text=text, audience_hint=hint or None)
    return out


async def parse_intent(runner: MuseRunner, utterance: str) -> Intent:
    def fallback() -> IntentOut:
        h = heuristic(utterance)
        return IntentOut(intent=h.intent, text=h.text, audience_hint=h.audience_hint)

    out = await runner.run_agent(
        AGENT,
        None,
        f"Utterance: {utterance.strip()}",
        IntentOut,
        fallback,
        max_tokens=MAX_TOKENS,
        check=_check,
    )
    text = out.text if out.intent == "start_move" else utterance.strip()
    return Intent(intent=out.intent, text=text, audience_hint=out.audience_hint)
