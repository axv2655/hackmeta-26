import asyncio
import logging

import pytest

from app.hooks import Hook, Hooks


def test_handlers_run_in_registration_order_sync_and_async() -> None:
    hook: Hook[[str]] = Hook("on_move_created")
    calls: list[str] = []

    def first(move_id: str) -> None:
        calls.append(f"sync:{move_id}")

    async def second(move_id: str) -> None:
        await asyncio.sleep(0)
        calls.append(f"async:{move_id}")

    hook.register(first)
    hook.register(second)
    asyncio.run(hook.fire("m1"))
    assert calls == ["sync:m1", "async:m1"]


def test_failing_handler_is_logged_and_does_not_stop_others(
    caplog: pytest.LogCaptureFixture,
) -> None:
    hooks = Hooks()
    calls: list[tuple[str, str]] = []

    @hooks.on_move_joined.register
    async def broken(move_id: str, user_id: str) -> None:
        raise RuntimeError("boom")

    hooks.on_move_joined.register(lambda m, u: calls.append((m, u)))

    with caplog.at_level(logging.ERROR, logger="app.hooks"):
        asyncio.run(hooks.on_move_joined.fire("m1", "u1"))

    assert calls == [("m1", "u1")]
    assert "on_move_joined" in caplog.text


def test_firing_with_no_handlers_is_a_noop() -> None:
    hooks = Hooks()
    for hook in (hooks.on_move_created, hooks.on_move_ended):
        asyncio.run(hook.fire("m1"))
    for hook in (hooks.on_move_joined, hooks.on_rating_submitted):
        asyncio.run(hook.fire("m1", "u1"))
