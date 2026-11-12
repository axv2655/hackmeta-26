"""Lifecycle hooks: how one lane reacts to another without importing it.

Core fires `on_move_created`, `on_move_joined` and `on_move_ended`; surfaces
fires `on_rating_submitted`. Subscribers register from their own
`app/lanes/<lane>.py`:

    hooks.on_move_created.register(sweep.on_move_created)
    await hooks.on_move_created.fire(move.id)

Handlers may be sync or async. They run one at a time in registration order;
an exception in one is logged and swallowed so one lane never breaks another.

Frozen: changing this file needs an issue that all three lane owners approve.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


type Handler[**P] = Callable[P, Awaitable[None] | None]


class Hook[**P]:
    def __init__(self, name: str) -> None:
        self.name = name
        self._handlers: list[Handler[P]] = []

    def register(self, handler: Handler[P]) -> Handler[P]:
        """Add a handler; returns it unchanged so this also works as a decorator."""
        self._handlers.append(handler)
        return handler

    @property
    def handlers(self) -> tuple[Handler[P], ...]:
        return tuple(self._handlers)

    async def fire(self, *args: P.args, **kwargs: P.kwargs) -> None:
        for handler in tuple(self._handlers):
            try:
                result = handler(*args, **kwargs)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception("%s handler %r failed", self.name, handler)


class Hooks:
    def __init__(self) -> None:
        # (move_id)
        self.on_move_created: Hook[[str]] = Hook("on_move_created")
        # (move_id, user_id)
        self.on_move_joined: Hook[[str, str]] = Hook("on_move_joined")
        # (move_id)
        self.on_move_ended: Hook[[str]] = Hook("on_move_ended")
        # (move_id, user_id)
        self.on_rating_submitted: Hook[[str, str]] = Hook("on_rating_submitted")
