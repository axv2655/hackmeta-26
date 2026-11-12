"""M1: Muse client, agent runner, muse_runs log, gateway binding."""

import asyncio
import json

import httpx
import pytest
from pydantic import BaseModel
from sqlmodel import Session, select

from app.container import Container
from app.core.config import Settings
from app.muse.client import (
    FakeMuseClient,
    HttpMuseClient,
    MuseError,
    client_from_settings,
    image_source,
)
from app.muse.gateway import MuseGatewayImpl
from app.muse.runner import AgentRejected, MuseRunner, extract_json
from app.ports import MuseGateway, RankedMove
from app.tables import MuseRun
from tests.muse.factories import T0, move_snap
from tests.muse.fakes import FixedClock

pytestmark = pytest.mark.anyio


class Out(BaseModel):
    word: str


def fallback() -> Out:
    return Out(word="fallback")


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


def make_runner(engine, clock, client, **kw) -> MuseRunner:
    return MuseRunner(client, clock=lambda: clock, engine=engine, **kw)


def runs(engine) -> list[MuseRun]:
    with Session(engine) as s:
        return list(s.exec(select(MuseRun)))


async def test_valid_output_parses_and_logs(engine, clock) -> None:
    client = FakeMuseClient({"t": {"word": "matcha"}})
    runner = make_runner(engine, clock, client)
    out = await runner.run_agent("t", "u1", "p", Out, fallback)
    assert out == Out(word="matcha")
    [run] = runs(engine)
    assert run.ok and not run.used_fallback and run.agent == "t"
    assert run.output == {"word": "matcha"} and run.created_at == T0


@pytest.mark.parametrize(
    "answer",
    ["not json at all", {"wrong": 1}, ValueError("boom"), MuseError("HTTP 500")],
    ids=["garbage", "schema", "error", "transport"],
)
async def test_bad_output_retries_once_then_falls_back(engine, clock, answer) -> None:
    client = FakeMuseClient({"t": answer})
    runner = make_runner(engine, clock, client)
    out = await runner.run_agent("t", None, "p", Out, fallback)
    assert out.word == "fallback"
    assert len(client.calls) == 2  # the call and one retry
    [run] = runs(engine)
    assert not run.ok and run.used_fallback


async def test_timeout_falls_back(engine, clock) -> None:
    client = FakeMuseClient({"t": {"word": "late"}}, delay_s=0.2)
    runner = make_runner(engine, clock, client, timeout_s=0.01)
    out = await runner.run_agent("t", None, "p", Out, fallback)
    assert out.word == "fallback"
    assert "timeout" in runs(engine)[0].output["errors"]


async def test_check_rejection_counts_as_invalid(engine, clock) -> None:
    client = FakeMuseClient({"t": {"word": "nobody came"}})
    runner = make_runner(engine, clock, client)

    def check(out: Out) -> Out:
        if "nobody" in out.word:
            raise AgentRejected("forbidden phrase")
        return out

    assert (
        await runner.run_agent("t", None, "p", Out, fallback, check=check)
    ).word == ("fallback")


async def test_retry_succeeds_on_second_attempt(engine, clock) -> None:
    answers = iter(["garbage", json.dumps({"word": "ok"})])
    client = FakeMuseClient({"t": lambda s, p: next(answers)})
    out = await make_runner(engine, clock, client).run_agent(
        "t", None, "p", Out, fallback
    )
    assert out.word == "ok"


async def test_cache_hit_does_not_call_the_client(engine, clock) -> None:
    client = FakeMuseClient({"t": {"word": "matcha"}})
    runner = make_runner(engine, clock, client)
    await runner.run_agent("t", None, "same", Out, fallback)
    await runner.run_agent("t", None, "same", Out, fallback)
    assert len(client.calls) == 1
    assert runner.get_stats()["cache_hits"] == 1
    await runner.run_agent("t", None, "different", Out, fallback)
    assert len(client.calls) == 2


async def test_fallbacks_are_not_cached(engine, clock) -> None:
    client = FakeMuseClient({"t": "garbage"})
    runner = make_runner(engine, clock, client)
    await runner.run_agent("t", None, "p", Out, fallback)
    await runner.run_agent("t", None, "p", Out, fallback)
    assert len(client.calls) == 4


async def test_stats(engine, clock) -> None:
    client = FakeMuseClient({"good": {"word": "x"}, "bad": "nope"})
    runner = make_runner(engine, clock, client)
    await runner.run_agent("good", None, "a longer prompt", Out, fallback)
    await runner.run_agent("bad", None, "a longer prompt", Out, fallback)
    stats = runner.get_stats()
    assert stats["calls"] == 2 and stats["fallbacks"] == 1
    assert stats["fallback_rate"] == 0.5
    assert stats["input_tokens"] > 0 and stats["output_tokens"] > 0
    assert stats["by_agent"]["bad"]["fallbacks"] == 1
    assert [o["agent"] for o in stats["last_outputs"]] == ["bad", "good"]


def test_extract_json_tolerates_fences_and_prose() -> None:
    assert extract_json('Sure!\n```json\n{"a": {"b": 1}}\n```') == {"a": {"b": 1}}
    assert extract_json('[1] then {"x": 2}') == {"x": 2}
    with pytest.raises(ValueError):
        extract_json("no object")


# --- HttpMuseClient: the only code that knows the wire format ----------------


async def test_http_client_speaks_anthropic_messages() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": [
                    {"type": "redacted_thinking", "data": "x"},
                    {"type": "text", "text": '{"word": "hi"}'},
                ],
                "usage": {"input_tokens": 12, "output_tokens": 34},
            },
        )

    client = HttpMuseClient(
        "https://muse.test/",
        "k",
        "muse-wonder-1.0",
        transport=httpx.MockTransport(handler),
    )
    out = await client.complete("[t] sys", "prompt", max_tokens=100)
    assert out.text == '{"word": "hi"}' and out.input_tokens == 12
    assert seen["url"] == "https://muse.test/v1/messages"
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["model"] == "muse-wonder-1.0"
    assert seen["body"]["max_tokens"] > 100  # thinking headroom on top
    assert seen["body"]["messages"][0]["content"] == [
        {"type": "text", "text": "prompt"}
    ]


async def test_http_client_errors_raise_muse_error() -> None:
    client = HttpMuseClient(
        "https://muse.test",
        "k",
        "m",
        transport=httpx.MockTransport(lambda r: httpx.Response(429, text="slow down")),
    )
    with pytest.raises(MuseError):
        await client.complete("s", "p")


async def test_http_client_sends_images_only_with_vision() -> None:
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"content": [{"type": "text", "text": "{}"}]})

    t = httpx.MockTransport(handler)
    await HttpMuseClient("https://m", "k", "m", transport=t).complete(
        "s", "p", images=["https://img"]
    )
    await HttpMuseClient("https://m", "k", "m", vision_model="v", transport=t).complete(
        "s", "p", images=["data:image/png;base64,QUJD"]
    )
    assert len(bodies[0]["messages"][0]["content"]) == 1
    image = bodies[1]["messages"][0]["content"][0]
    assert image == {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"},
    }
    assert bodies[1]["model"] == "v"
    assert image_source("https://x/y.jpg") == {"type": "url", "url": "https://x/y.jpg"}


def test_offline_and_unconfigured_use_the_fake_client() -> None:
    configured = dict(
        MUSE_BASE_URL="https://api.meta.ai",
        MUSE_API_KEY="k",
        MUSE_MODEL="muse-wonder-1.0",
        _env_file=None,
    )
    assert isinstance(client_from_settings(Settings(**configured)), HttpMuseClient)
    assert isinstance(
        client_from_settings(Settings(**configured, DEMO_MODE="offline")),
        FakeMuseClient,
    )
    assert isinstance(client_from_settings(Settings(_env_file=None)), FakeMuseClient)


# --- Gateway ------------------------------------------------------------------


async def test_unbound_gateway_method_returns_the_null_result(clock) -> None:
    gateway = MuseGatewayImpl(make_runner(None, clock, FakeMuseClient()))
    assert isinstance(gateway, MuseGateway)
    moves = [move_snap("m1", "a"), move_snap("m2", "b")]
    assert await gateway.rank_moves("v", moves) == [
        RankedMove("m1", ""),
        RankedMove("m2", ""),
    ]
    assert (await gateway.parse_intent("hi")).intent == "none"
    assert await gateway.run_flare_scan("u") is None
    assert await gateway.notify_preview("u", mark_id="k", text="t") == []
    assert gateway.muse_stats()["calls"] == 0


async def test_bound_gateway_method_is_called(clock) -> None:
    gateway = MuseGatewayImpl(make_runner(None, clock, FakeMuseClient()))
    calls = []

    async def rank(viewer_id, moves):
        calls.append(viewer_id)
        return [RankedMove("m1", "because")]

    gateway.bind("rank_moves", rank)
    assert await gateway.rank_moves("v", []) == [RankedMove("m1", "because")]
    assert calls == ["v"]
    with pytest.raises(ValueError):
        gateway.bind("not_a_method", rank)


def test_lane_registers_the_gateway(engine) -> None:
    from app.hooks import Hooks
    from app.lanes import muse
    from app.scheduler.loop import Scheduler

    container = Container()
    lane = muse.register(
        container, Hooks(), Scheduler(), engine=engine, client=FakeMuseClient()
    )
    assert container.muse is lane.gateway
    assert asyncio.run(container.muse.parse_intent("x")).intent in (
        "none",
        "start_move",
    )
