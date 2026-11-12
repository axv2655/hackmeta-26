"""Muse model clients (ARCHITECTURE.md 3.2, 10.2).

`HttpMuseClient.complete()` is the ONLY code in the backend that knows the
Muse wire format. Muse is Anthropic Messages-compatible:

    POST {MUSE_BASE_URL}/v1/messages
    Authorization: Bearer {MUSE_API_KEY}
    {"model", "max_tokens", "system",
     "messages": [{"role": "user", "content": [...]}]}
    -> {"content": [{"type": "text", "text": ...}],
        "usage": {"input_tokens", "output_tokens"}}

There is no native JSON mode, so `json=True` appends a strict instruction to
the system prompt; the runner extracts and validates the object either way.

`FakeMuseClient` answers from canned or programmable outputs. It backs tests,
`DEMO_MODE=offline`, and any run without `MUSE_API_KEY`.
"""

from __future__ import annotations

import asyncio
import json as jsonlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import Settings, settings

ANTHROPIC_VERSION = "2023-06-01"
# Verified 2026-11-12: thinking cannot be disabled, `budget_tokens` does not
# cap it, and it counts against max_tokens. Small prompts think ~100-300
# tokens; the notify picker thinks ~1,600-2,100 and returned no text at all
# under a 1,524 cap. Only tokens actually used are billed, so this is a
# ceiling, not a cost.
THINKING_HEADROOM = 4096
JSON_INSTRUCTION = (
    "\n\nRespond with ONLY one JSON object that matches the requested shape. "
    "No prose, no markdown fences."
)


def image_source(url: str) -> dict[str, str]:
    """`data:image/png;base64,...` is sent inline; anything else as a URL.

    Verified 2026-11-12: inline base64 works; a URL works only when its host
    lets Muse download it (some CDNs refuse), so prefer inline for demo media.
    """
    if url.startswith("data:") and ";base64," in url:
        header, data = url.split(",", 1)
        media_type = header[len("data:") :].split(";", 1)[0] or "image/jpeg"
        return {"type": "base64", "media_type": media_type, "data": data}
    return {"type": "url", "url": url}


class MuseError(RuntimeError):
    """Transport or protocol failure talking to Muse. The runner falls back."""


@dataclass(frozen=True, slots=True)
class MuseCompletion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0


class MuseClient(Protocol):
    @property
    def supports_vision(self) -> bool: ...

    async def complete(
        self,
        system: str,
        prompt: str,
        *,
        images: Sequence[str] | None = None,
        json: bool = True,
        max_tokens: int = 400,
    ) -> MuseCompletion: ...


class HttpMuseClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        *,
        vision_model: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_s: float = 10.0,
    ) -> None:
        self._url = base_url.rstrip("/") + "/v1/messages"
        self._api_key = api_key
        self._model = model
        self._vision_model = vision_model
        self._transport = transport
        self._timeout_s = timeout_s

    @property
    def supports_vision(self) -> bool:
        return self._vision_model is not None

    async def complete(
        self,
        system: str,
        prompt: str,
        *,
        images: Sequence[str] | None = None,
        json: bool = True,
        max_tokens: int = 400,
    ) -> MuseCompletion:
        content: list[dict[str, Any]] = []
        use_images = bool(images) and self.supports_vision
        if use_images:
            content.extend(
                {"type": "image", "source": image_source(url)} for url in images or ()
            )
        content.append({"type": "text", "text": prompt})
        body = {
            "model": self._vision_model if use_images else self._model,
            # Muse always reasons first (a `redacted_thinking` block, ~100 to
            # 300 tokens) and that counts against max_tokens, so the agent's
            # answer budget sits on top of a fixed thinking headroom.
            "max_tokens": max_tokens + THINKING_HEADROOM,
            "system": system + (JSON_INSTRUCTION if json else ""),
            "messages": [{"role": "user", "content": content}],
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=self._timeout_s
            ) as http:
                response = await http.post(self._url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise MuseError(f"transport: {exc!r}") from exc
        if response.status_code != 200:
            raise MuseError(f"HTTP {response.status_code}: {response.text[:300]}")
        try:
            data = response.json()
            text = "".join(
                block.get("text", "")
                for block in data.get("content", [])
                if block.get("type") == "text"
            )
            usage = data.get("usage") or {}
        except (ValueError, AttributeError, TypeError) as exc:
            raise MuseError(f"bad response body: {response.text[:300]}") from exc
        return MuseCompletion(
            text=text,
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
        )


type FakeResponder = Callable[[str, str], str | dict[str, Any] | Exception]


@dataclass
class FakeMuseClient:
    """Programmable stand-in for Muse.

    - `responses[agent]`: output for prompts whose system prompt starts with
      `[agent]` (every runner call is tagged that way). A dict is JSON-encoded;
      an Exception is raised; a callable gets `(system, prompt)`.
    - `default`: used when no agent matches. The default `{}` fails most
      schemas, so agents fall back: offline mode behaves like "Muse is down
      but every feature still works".
    - `delay_s`: sleep before answering (timeout tests).
    """

    responses: dict[str, Any] = field(default_factory=dict)
    default: Any = field(default_factory=dict)
    delay_s: float = 0.0
    vision: bool = False
    calls: list[tuple[str, str]] = field(default_factory=list)

    @property
    def supports_vision(self) -> bool:
        return self.vision

    async def complete(
        self,
        system: str,
        prompt: str,
        *,
        images: Sequence[str] | None = None,
        json: bool = True,
        max_tokens: int = 400,
    ) -> MuseCompletion:
        self.calls.append((system, prompt))
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        agent = system[1 : system.find("]")] if system.startswith("[") else ""
        out = self.responses.get(agent, self.default)
        if callable(out) and not isinstance(out, Exception):
            out = out(system, prompt)
        if isinstance(out, Exception):
            raise out
        text = out if isinstance(out, str) else jsonlib.dumps(out)
        return MuseCompletion(
            text=text, input_tokens=len(prompt) // 4, output_tokens=len(text) // 4
        )


def client_from_settings(config: Settings = settings) -> MuseClient:
    """The real client when Muse is configured, else the fake (offline)."""
    key = config.MUSE_API_KEY.get_secret_value() if config.MUSE_API_KEY else ""
    if (
        config.DEMO_MODE == "offline"
        or not key
        or key.startswith("PASTE_")
        or not config.MUSE_BASE_URL
        or not config.MUSE_MODEL
    ):
        return FakeMuseClient()
    return HttpMuseClient(
        str(config.MUSE_BASE_URL),
        key,
        config.MUSE_MODEL,
        vision_model=config.MUSE_VISION_MODEL,
    )
