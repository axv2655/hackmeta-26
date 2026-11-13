"""Fakes of foreign ports for surfaces-lane tests only.

Never import another lane's fakes: a bug in theirs must not mask or break yours.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.ports import MoveSnapshot


@dataclass
class FixedClock:
    at: datetime

    def now(self) -> datetime:
        return self.at


@dataclass
class SpyNotifier:
    sent: list[dict[str, Any]] = field(default_factory=list)
    fail_for: frozenset[str] = frozenset()

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        if user_id in self.fail_for:
            raise RuntimeError("notifier down")
        self.sent.append(
            {
                "user_id": user_id,
                "type": type,
                "title": title,
                "body": body,
                "data": data,
            }
        )
        return f"n{len(self.sent)}"


@dataclass
class SpyEvents:
    published: list[tuple[list[str], str, dict[str, Any]]] = field(default_factory=list)

    async def publish(
        self, user_ids: Iterable[str], type: str, data: dict[str, Any]
    ) -> None:
        self.published.append((sorted(user_ids), type, data))


@dataclass
class FakeMoves:
    """`MoveGateway.get` only, from a dict of snapshots."""

    moves: dict[str, MoveSnapshot] = field(default_factory=dict)

    def get(self, move_id: str) -> MoveSnapshot | None:
        return self.moves.get(move_id)


@dataclass
class SpyMuse:
    """A Muse gateway with the optional `refresh_pseudo_groups` hook."""

    refreshed: list[list[str]] = field(default_factory=list)

    async def refresh_pseudo_groups(self, user_ids: list[str]) -> None:
        self.refreshed.append(sorted(user_ids))


@dataclass
class HookSpy:
    calls: list[tuple[Any, ...]] = field(default_factory=list)

    async def __call__(self, *args: Any) -> None:
        self.calls.append(args)
