"""`ConnectionHub`: user_id -> open sockets; the `EventPublisher` port (C9).

Every event goes out as the envelope `{"type", "data", "ts"}` from
ARCHITECTURE.md 9.1, with `ts` an ISO 8601 timestamp read from the `Clock`
port (so it follows demo time). One envelope is built per publish and sent to
each target socket concurrently. A socket that raises or stalls past
`send_timeout` is dropped and closed best-effort, so it can never stop the
event reaching anyone else; the client's reconnect refetches what it missed.

The hub lives on one event loop and mutates its registry only between awaits,
so it needs no locks.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from contextlib import suppress
from typing import Any, Protocol

from app.ports import Clock, EventType

logger = logging.getLogger(__name__)

DEFAULT_SEND_TIMEOUT = 5.0
WS_1011_INTERNAL_ERROR = 1011


class EventSocket(Protocol):
    """The part of a Starlette `WebSocket` the hub uses; tests pass fakes."""

    async def send_json(self, data: Any) -> None: ...

    async def close(self, code: int = 1000) -> None: ...


class ConnectionHub:
    def __init__(
        self, clock: Clock, *, send_timeout: float = DEFAULT_SEND_TIMEOUT
    ) -> None:
        self._clock = clock
        self._send_timeout = send_timeout
        self._sockets: dict[str, set[EventSocket]] = {}

    def connect(self, user_id: str, socket: EventSocket) -> None:
        """Register an accepted socket. A user may hold any number."""
        self._sockets.setdefault(user_id, set()).add(socket)

    def disconnect(self, user_id: str, socket: EventSocket) -> None:
        """Forget `socket`; a no-op if it is already gone."""
        sockets = self._sockets.get(user_id)
        if sockets is None:
            return
        sockets.discard(socket)
        if not sockets:
            del self._sockets[user_id]

    def socket_count(self, user_id: str) -> int:
        return len(self._sockets.get(user_id, ()))

    async def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        envelope = {"type": type, "data": data, "ts": self._clock.now().isoformat()}
        # Snapshot the targets: the registry may change while sends await.
        targets = [
            (user_id, socket)
            for user_id in set(user_ids)
            for socket in tuple(self._sockets.get(user_id, ()))
        ]
        await asyncio.gather(
            *(self._send(user_id, socket, envelope) for user_id, socket in targets)
        )

    async def _send(
        self, user_id: str, socket: EventSocket, envelope: dict[str, Any]
    ) -> None:
        try:
            async with asyncio.timeout(self._send_timeout):
                await socket.send_json(envelope)
        except Exception:
            logger.info("dropping dead socket for user %s", user_id, exc_info=True)
            self.disconnect(user_id, socket)
            with suppress(Exception):
                async with asyncio.timeout(self._send_timeout):
                    await socket.close(code=WS_1011_INTERNAL_ERROR)
