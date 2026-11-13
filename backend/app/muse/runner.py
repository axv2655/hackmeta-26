"""The one door every Muse agent goes through (ARCHITECTURE.md 10.2, 10.12).

    value = await runner.run_agent(
        "notify_picker", user_id, prompt, NotifyPickerOut, fallback,
        max_tokens=500, check=enforce_rules,
    )

1. Serve a cached result for the same prompt hash within 60 s.
2. Call `MuseClient.complete` with a 6 s timeout (`slow=True`: 20 s, for
   background agents whose prompts make Muse think for 6 to 9 s).
3. Extract the first JSON object, validate it against `schema`, then run the
   agent's own `check` (raise `ValueError` to reject an answer).
4. On timeout, transport error, garbage or a failed check: retry once, then
   return `fallback()`. Once `token_budget` is spent, skip the call and fall
   back at once. `run_agent_meta` also says whether the fallback was used.
5. Write a `muse_runs` row either way, and keep in-memory stats for
   `GET /demo/muse-stats`.

System prompts live in `app/muse/prompts/<agent>.md` and are sent tagged
`[agent]` so logs and `FakeMuseClient` can tell agents apart.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import Engine
from sqlmodel import Session

from app.muse.client import MuseClient
from app.ports import Clock
from app.tables import MuseRun

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
TIMEOUT_S = 6.0  # user-facing agents (10.2)
SLOW_TIMEOUT_S = 20.0  # background agents: Muse thinks ~2k tokens, 6-9 s
ATTEMPTS = 2  # the call plus one retry
CACHE_TTL_S = 60.0
LAST_OUTPUTS = 20


class AgentRejected(ValueError):
    """Raised by an agent's `check` when Muse's answer breaks a hard rule."""


@cache
def load_prompt(agent: str) -> str:
    path = PROMPTS_DIR / f"{agent}.md"
    body = path.read_text(encoding="utf-8") if path.exists() else ""
    return f"[{agent}] {body}".strip()


def extract_json(text: str) -> dict[str, Any]:
    """The first JSON object in `text`, tolerating fences and stray prose."""
    decoder = json.JSONDecoder()
    start = text.find("{")
    while start != -1:
        try:
            value, _ = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            start = text.find("{", start + 1)
            continue
        if isinstance(value, dict):
            return value
        start = text.find("{", start + 1)
    raise ValueError("no JSON object in Muse output")


def prompt_hash(agent: str, system: str, prompt: str, images: Sequence[str]) -> str:
    digest = hashlib.sha256()
    for part in (agent, system, prompt, *images):
        digest.update(part.encode("utf-8"))
        digest.update(b"\x00")
    return digest.hexdigest()[:24]


@dataclass
class AgentStats:
    calls: int = 0
    muse_calls: int = 0
    fallbacks: int = 0
    cache_hits: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms_total: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "calls": self.calls,
            "muse_calls": self.muse_calls,
            "fallbacks": self.fallbacks,
            "fallback_rate": round(self.fallbacks / self.calls, 3)
            if self.calls
            else 0.0,
            "cache_hits": self.cache_hits,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "avg_latency_ms": (
                self.latency_ms_total // self.muse_calls if self.muse_calls else 0
            ),
        }


@dataclass
class MuseRunner:
    client: MuseClient
    clock: Callable[[], Clock]
    """Read at call time so Demo Control's shifted clock is honored."""
    engine: Engine | None = None
    """Where `muse_runs` rows go; None skips the log (pure unit tests)."""
    timeout_s: float = TIMEOUT_S
    slow_timeout_s: float = SLOW_TIMEOUT_S
    cache_ttl_s: float = CACHE_TTL_S
    token_budget: int | None = None
    """Input + output tokens this process may spend; None means no cap. Once
    spent, every agent goes straight to its fallback without a network call."""
    deterministic: bool = False
    """True (`MUSE_DETERMINISTIC`): never call the model; every agent answers
    with its scored, rule-based fallback at once and nothing is logged."""
    _cache: dict[str, tuple[float, BaseModel]] = field(default_factory=dict)
    _total: AgentStats = field(default_factory=AgentStats)
    _by_agent: dict[str, AgentStats] = field(default_factory=dict)
    _last: deque[dict[str, Any]] = field(
        default_factory=lambda: deque(maxlen=LAST_OUTPUTS)
    )

    @property
    def supports_vision(self) -> bool:
        return self.client.supports_vision

    async def run_agent[T: BaseModel](
        self,
        agent: str,
        user_id: str | None,
        prompt: str,
        schema: type[T],
        fallback: Callable[[], T],
        *,
        images: Sequence[str] | None = None,
        max_tokens: int = 400,
        check: Callable[[T], T] | None = None,
        system: str | None = None,
        slow: bool = False,
    ) -> T:
        value, _ = await self.run_agent_meta(
            agent,
            user_id,
            prompt,
            schema,
            fallback,
            images=images,
            max_tokens=max_tokens,
            check=check,
            system=system,
            slow=slow,
        )
        return value

    async def run_agent_meta[T: BaseModel](
        self,
        agent: str,
        user_id: str | None,
        prompt: str,
        schema: type[T],
        fallback: Callable[[], T],
        *,
        images: Sequence[str] | None = None,
        max_tokens: int = 400,
        check: Callable[[T], T] | None = None,
        system: str | None = None,
        slow: bool = False,
    ) -> tuple[T, bool]:
        """Like `run_agent`, plus whether the value came from `fallback()`.

        A cache hit replays a Muse answer, so it reports `False`."""
        stats = self._by_agent.setdefault(agent, AgentStats())
        for s in (stats, self._total):
            s.calls += 1
        if self.deterministic:
            for s in (stats, self._total):
                s.fallbacks += 1
            return fallback(), True

        system = system or load_prompt(agent)
        images = list(images or ()) if self.client.supports_vision else []
        key = prompt_hash(agent, system, prompt, images)

        cached = self._cache.get(key)
        if cached and cached[0] > time.monotonic():
            for s in (stats, self._total):
                s.cache_hits += 1
            return schema.model_validate(cached[1].model_dump()), False

        started = time.perf_counter()
        if self.budget_exhausted:
            return self._fall_back(
                agent, user_id, key, stats, fallback, started, 0, 0, ["budget"]
            ), True

        tokens_in = tokens_out = 0
        errors: list[str] = []
        for _ in range(ATTEMPTS):
            for s in (stats, self._total):
                s.muse_calls += 1
            try:
                completion = await asyncio.wait_for(
                    self.client.complete(
                        system, prompt, images=images, json=True, max_tokens=max_tokens
                    ),
                    timeout=self.slow_timeout_s if slow else self.timeout_s,
                )
                tokens_in += completion.input_tokens
                tokens_out += completion.output_tokens
                value = schema.model_validate(extract_json(completion.text))
                if check is not None:
                    value = check(value)
            except TimeoutError:
                errors.append("timeout")
                continue
            except (ValidationError, ValueError) as exc:
                errors.append(f"invalid: {str(exc)[:200]}")
                continue
            except Exception as exc:  # transport or anything else: fall back
                errors.append(f"error: {exc!r}"[:200])
                continue
            latency = int((time.perf_counter() - started) * 1000)
            self._cache[key] = (time.monotonic() + self.cache_ttl_s, value)
            self._record(
                agent,
                user_id,
                key,
                stats,
                tokens_in,
                tokens_out,
                latency,
                ok=True,
                output=value.model_dump(mode="json"),
            )
            return value, False

        return self._fall_back(
            agent, user_id, key, stats, fallback, started, tokens_in, tokens_out, errors
        ), True

    @property
    def tokens_used(self) -> int:
        return self._total.input_tokens + self._total.output_tokens

    @property
    def budget_exhausted(self) -> bool:
        """True once `token_budget` (input + output tokens) is spent."""
        return self.token_budget is not None and self.tokens_used >= self.token_budget

    def _fall_back[T: BaseModel](
        self,
        agent: str,
        user_id: str | None,
        key: str,
        stats: AgentStats,
        fallback: Callable[[], T],
        started: float,
        tokens_in: int,
        tokens_out: int,
        errors: list[str],
    ) -> T:
        value = fallback()
        latency = int((time.perf_counter() - started) * 1000)
        logger.info("muse %s fell back: %s", agent, "; ".join(errors))
        for s in (stats, self._total):
            s.fallbacks += 1
        self._record(
            agent,
            user_id,
            key,
            stats,
            tokens_in,
            tokens_out,
            latency,
            ok=False,
            output={"fallback": value.model_dump(mode="json"), "errors": errors},
        )
        return value

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._total.as_dict(),
            "client": type(self.client).__name__,
            "tokens_used": self.tokens_used,
            "budget_tokens": self.token_budget,
            "budget_exhausted": self.budget_exhausted,
            "by_agent": {
                name: s.as_dict() for name, s in sorted(self._by_agent.items())
            },
            "last_outputs": list(self._last),
        }

    def clear_cache(self) -> None:
        self._cache.clear()

    def _record(
        self,
        agent: str,
        user_id: str | None,
        key: str,
        stats: AgentStats,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        *,
        ok: bool,
        output: dict[str, Any],
    ) -> None:
        for s in (stats, self._total):
            s.input_tokens += tokens_in
            s.output_tokens += tokens_out
            s.latency_ms_total += latency_ms
        now = self.clock().now()
        self._last.appendleft(
            {
                "agent": agent,
                "ok": ok,
                "used_fallback": not ok,
                "latency_ms": latency_ms,
                "at": now.isoformat(),
                "output": output,
            }
        )
        if self.engine is None:
            return
        try:
            with Session(self.engine) as session:
                session.add(
                    MuseRun(
                        agent=agent,
                        user_id=user_id,
                        input_tokens=tokens_in,
                        output_tokens=tokens_out,
                        latency_ms=latency_ms,
                        ok=ok,
                        used_fallback=not ok,
                        prompt_hash=key,
                        output=output,
                        created_at=now,
                    )
                )
                session.commit()
        except Exception:  # the audit log must never break an agent
            logger.exception("could not write muse_runs row for %s", agent)
