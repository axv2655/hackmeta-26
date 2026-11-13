"""Muse smoke test: call every agent once with the configured client.

    uv run python -m app.muse.smoke

Owner-only, once `MUSE_API_KEY` is set. It never touches the database (the
runner gets `engine=None`) and each call is a tiny canned prompt, so a full
run costs a few thousand tokens. Prints one line per agent:

    agent  ok|fallback  latency ms  tokens in/out

With no key it runs on `FakeMuseClient` and exits cleanly (most agents report
`fallback`, which is the expected heuristic path).
"""

from __future__ import annotations

import asyncio
import importlib
import sys
import time
from dataclasses import dataclass

from pydantic import BaseModel

from app.core.clock import SystemClock
from app.muse.client import MuseClient, client_from_settings, client_kind, client_model
from app.muse.runner import MuseRunner


@dataclass(frozen=True)
class Probe:
    agent: str
    module: str
    schema: str
    prompt: str
    max_tokens: int = 300
    slow: bool = True


PROBES: tuple[Probe, ...] = (
    Probe(
        "move_writer",
        "app.muse.agents.move_writer",
        "WriterOut",
        "Place: Kumo Matcha (coffee; cozy, matcha)\nTime: Thu 3:10 PM (afternoon)\n"
        "Poster's taste: matcha, quiet spots\nSeed text: none",
        150,
    ),
    Probe(
        "place_resolver",
        "app.muse.agents.place_resolver",
        "ResolverOut",
        "Content caption: matcha run at kumo\nCandidates (nearest first):\n"
        "k1 | Kumo Matcha | coffee | cozy\nk2 | Taco Spot | food | cheap",
        150,
    ),
    Probe(
        "notify_picker",
        "app.muse.agents.notify_picker",
        "PickerOut",
        'Move: "matcha at kumo" (coffee) at Kumo Matcha, Thu 3:10 PM.\n'
        "Creator: {u1}. Already there: nobody.\nCap: at most 2 picks.\n"
        "Must include: none.\nCandidates:\n"
        "{u2} | close friend | hung out 3x this month | free\n"
        "{u3} | circle | likes coffee | free",
        500,
    ),
    Probe(
        "move_ranker",
        "app.muse.agents.move_ranker",
        "RankerOut",
        "m1 | coffee | Kumo Matcha | matcha rn | {u2} (0.8) | y | - | 5\n"
        "m2 | food | Taco Spot | tacos? | {u3} (0.2) | n | - | 30",
    ),
    Probe(
        "intent",
        "app.muse.agents.intent",
        "IntentOut",
        "Utterance: heading to kumo for matcha, tell my roommates",
        150,
        slow=False,
    ),
    Probe(
        "flare",
        "app.muse.agents.flare",
        "FlareOut",
        "Free window: 3:10 PM to 4:00 PM.\nSaved Marks: k1 | Kumo Matcha | coffee\n"
        "Friends free: {u2}, {u3}",
        500,
    ),
    Probe(
        "nobody_bit",
        "app.muse.agents.nobody_bit",
        "NobodyOut",
        "Quiet Move: m1 | coffee | Kumo Matcha | posted 20 min ago | nobody joined\n"
        "Live Moves nearby: m2 | food | Taco Spot | {u3} there",
    ),
    Probe(
        "revive",
        "app.muse.agents.revive",
        "ReviveOut",
        "Crew: {u2}, {u3}. Last outing 21 days ago (usually every 7).\n"
        "Usual: coffee at Kumo Matcha on Thursdays.",
    ),
    Probe(
        "taste",
        "app.muse.agents.taste",
        "TasteOut",
        "Ratings: Kumo Matcha 5 (cozy), Taco Spot 2 (loud), Library 4 (quiet)",
    ),
    Probe(
        "pseudo_group_label",
        "app.muse.pseudo_groups",
        "LabelOut",
        "Members: Maya, Leo. Pattern: coffee, Thursday afternoons, Kumo Matcha.",
        60,
    ),
)


def _schema(probe: Probe) -> type[BaseModel] | None:
    try:
        found = getattr(importlib.import_module(probe.module), probe.schema)
    except (ImportError, AttributeError):
        return None
    return found if isinstance(found, type) and issubclass(found, BaseModel) else None


async def run_probe(runner: MuseRunner, probe: Probe) -> str:
    schema = _schema(probe)
    if schema is None:
        return f"{probe.agent:<20} skip      (no {probe.module}.{probe.schema})"
    before = runner.tokens_used
    started = time.perf_counter()
    _, used_fallback = await runner.run_agent_meta(
        probe.agent,
        None,
        probe.prompt,
        schema,
        schema.model_construct,
        max_tokens=probe.max_tokens,
        slow=probe.slow,
    )
    ms = int((time.perf_counter() - started) * 1000)
    status = "fallback" if used_fallback else "ok"
    tokens = runner.tokens_used - before
    return f"{probe.agent:<20} {status:<9} {ms:>6} ms  {tokens:>6} tokens"


async def main(client: MuseClient | None = None) -> int:
    client = client or client_from_settings()
    system_clock = SystemClock()
    runner = MuseRunner(client, clock=lambda: system_clock, engine=None)
    print(
        f"client={client_kind(client)} model={client_model(client)} "
        f"vision={client.supports_vision}"
    )
    fallbacks = 0
    for probe in PROBES:
        line = await run_probe(runner, probe)
        fallbacks += " fallback " in line
        print(line, flush=True)
    stats = runner.get_stats()
    print(
        f"total: {stats['muse_calls']} Muse calls, {fallbacks} fallbacks, "
        f"{runner.tokens_used} tokens"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
