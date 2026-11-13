"""`MuseGatewayImpl`: the single implementation of the `MuseGateway` port.

Each muse task binds its function from `app/lanes/muse.py`:

    gateway.bind("rank_moves", ranker.rank_moves)

and never edits this file. A method nobody has bound answers exactly like
`NullMuseGateway`, so consumers work before (and without) every agent.

Extras beyond the port, used inside the muse lane and by Demo Control or the
hangout recorder through `getattr`: `notify_preview`, `run_free_time_scan`,
`demo_flare_scan`, `demo_free_time_scan`, `refresh_pseudo_groups` and
`move_tendencies` (the Move routes' tendency tab). Unbound, they answer `[]`,
`None`, `0` or `{}`.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Sequence
from typing import Any

from app.domain.move_tendency import TendencyNote
from app.muse.runner import MuseRunner
from app.ports import (
    Intent,
    MoveDraftOut,
    MoveSnapshot,
    NotifyPickOut,
    PlaceResolution,
    RankedMove,
    SuggestionSnapshot,
)
from app.ports_null import NullMuseGateway

BINDABLE = frozenset(
    {
        "compose_move",
        "notify_move",
        "notify_preview",
        "rank_moves",
        "resolve_place",
        "parse_intent",
        "run_flare_scan",
        "run_free_time_scan",
        "run_revive_scan",
        "run_nobody_bit",
        "run_route",
        "demo_flare_scan",
        "demo_free_time_scan",
        "refresh_pseudo_groups",
        "move_tendencies",
    }
)


class MuseGatewayImpl:
    def __init__(self, runner: MuseRunner, lane: Any = None) -> None:
        self.runner = runner
        self.lane = lane
        """The `MuseLane` this gateway serves (routes reach services through it)."""
        self._null = NullMuseGateway()
        self._bound: dict[str, Callable[..., Any]] = {}

    def bind(self, method: str, fn: Callable[..., Any]) -> None:
        if method not in BINDABLE:
            raise ValueError(f"MuseGateway has no bindable method {method!r}")
        self._bound[method] = fn

    def is_bound(self, method: str) -> bool:
        return method in self._bound

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut:
        fn = self._bound.get("compose_move", self._null.compose_move)
        return await fn(user_id, mark_id=mark_id, seed_text=seed_text, coarse=coarse)

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        fn = self._bound.get("notify_move", self._null.notify_move)
        return await fn(move_id, force_ids, drop_ids)

    async def notify_preview(
        self,
        user_id: str,
        *,
        mark_id: str,
        text: str,
        category: str | None = None,
        circle_ids: Sequence[str] = (),
        user_ids: Sequence[str] = (),
    ) -> list[NotifyPickOut]:
        """Picks for a draft that is not posted yet (composer, Reels, glasses)."""
        fn = self._bound.get("notify_preview")
        if fn is None:
            return []
        return await fn(
            user_id,
            mark_id=mark_id,
            text=text,
            category=category,
            circle_ids=circle_ids,
            user_ids=user_ids,
        )

    async def rank_moves(
        self, viewer_id: str, moves: Sequence[MoveSnapshot]
    ) -> list[RankedMove]:
        fn = self._bound.get("rank_moves", self._null.rank_moves)
        return await fn(viewer_id, moves)

    async def resolve_place(
        self,
        user_id: str,
        *,
        geotag_mark_id: str | None = None,
        caption: str | None = None,
        coarse: tuple[float, float] | None = None,
        frame_url: str | None = None,
    ) -> PlaceResolution:
        fn = self._bound.get("resolve_place", self._null.resolve_place)
        return await fn(
            user_id,
            geotag_mark_id=geotag_mark_id,
            caption=caption,
            coarse=coarse,
            frame_url=frame_url,
        )

    async def parse_intent(self, utterance: str) -> Intent:
        fn = self._bound.get("parse_intent", self._null.parse_intent)
        return await fn(utterance)

    async def run_flare_scan(self, user_id: str) -> SuggestionSnapshot | None:
        fn = self._bound.get("run_flare_scan", self._null.run_flare_scan)
        return await fn(user_id)

    async def run_free_time_scan(self, user_id: str) -> SuggestionSnapshot | None:
        fn = self._bound.get("run_free_time_scan")
        return None if fn is None else await fn(user_id)

    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None:
        fn = self._bound.get("run_revive_scan", self._null.run_revive_scan)
        return await fn(user_id)

    async def run_nobody_bit(self, move_id: str) -> SuggestionSnapshot | None:
        fn = self._bound.get("run_nobody_bit", self._null.run_nobody_bit)
        return await fn(move_id)

    async def run_route(
        self, move_id: str, user_ids: Sequence[str]
    ) -> SuggestionSnapshot | None:
        fn = self._bound.get("run_route", self._null.run_route)
        return await fn(move_id, user_ids)

    async def demo_flare_scan(self, user_id: str) -> SuggestionSnapshot | None:
        """Flare scan that skips the cooldown and pacing (Demo Control)."""
        fn = self._bound.get("demo_flare_scan")
        return None if fn is None else await fn(user_id)

    async def demo_free_time_scan(self, user_id: str) -> SuggestionSnapshot | None:
        """Free-time scan that skips the cooldown and pacing (Demo Control)."""
        fn = self._bound.get("demo_free_time_scan")
        return None if fn is None else await fn(user_id)

    async def refresh_pseudo_groups(self, user_ids: Sequence[str]) -> int:
        """Recompute these owners' Pseudo-groups; how many groups changed."""
        fn = self._bound.get("refresh_pseudo_groups")
        return 0 if fn is None else int(await fn(list(user_ids)) or 0)

    async def move_tendencies(
        self, moves: Sequence[MoveSnapshot]
    ) -> dict[str, TendencyNote]:
        """How long each live Move's creator's Moves usually last, by Move id.
        Moves without enough history are left out."""
        fn = self._bound.get("move_tendencies")
        return {} if fn is None else await fn(moves)

    def muse_stats(self) -> dict[str, Any]:
        return self.runner.get_stats()
