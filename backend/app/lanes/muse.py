"""Wires the muse lane into the app. Only the muse lane edits this file.

Registers: Notifier (M4) and MuseGateway (M1+); handlers on on_move_created,
on_move_joined (M4) and on_rating_submitted (M8); flare, revive and nobody-bit
jobs (M7, M9, M10).

In `DEMO_MODE` the autonomous jobs (flare scan, nobody-bit, Pseudo-groups) are
not registered: Demo Control triggers them on cue instead. Route suggestions
are never triggered by a Pull up (F22 is out); `run_route` stays bound.

`register(..., engine=..., client=...)` lets tests wire the lane onto an
in-memory database with a `FakeMuseClient`.
"""

import inspect
import logging

from sqlalchemy import Engine
from sqlmodel import select

from app.container import Container
from app.core import db
from app.core.config import settings
from app.hooks import Hooks
from app.muse.agents.flare import FlareScanner
from app.muse.agents.intent import parse_intent
from app.muse.agents.move_ranker import MoveRanker
from app.muse.agents.nobody_bit import NobodyBitService
from app.muse.agents.revive import ReviveService
from app.muse.agents.route import RouteService
from app.muse.client import (
    MuseClient,
    client_from_settings,
    client_kind,
    client_model,
)
from app.muse.compose import ComposeService
from app.muse.lane import MuseLane
from app.muse.pseudo_groups import PseudoGroupService
from app.scheduler.loop import Scheduler
from app.services.notify import MuseNotifier, NotifyService
from app.services.suggestions import SuggestionService
from app.services.taste import TasteService
from app.tables import UserSettings

logger = logging.getLogger(__name__)
AUTONOMOUS_JOBS = ("muse_flare_scan", "muse_nobody_bit", "muse_pseudo_groups")


async def _forced(fn, user_id: str):
    """`fn(user_id, force=True)` when `fn` takes `force`, else `fn(user_id)`."""
    if "force" in inspect.signature(fn).parameters:
        return await fn(user_id, force=True)
    return await fn(user_id)


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
    client: MuseClient | None = None,
) -> MuseLane:
    # M1: runner, client and the MuseGateway port
    fast_client = None
    if client is None:
        client = client_from_settings()
        if settings.MUSE_FAST_MODEL:
            fast_client = client_from_settings(
                settings.model_copy(update={"MUSE_MODEL": settings.MUSE_FAST_MODEL})
            )
    lane = MuseLane.build(
        engine or db.engine,
        container,
        client,
        token_budget=settings.MUSE_TOKEN_BUDGET,
        deterministic=settings.MUSE_DETERMINISTIC,
        fast_client=fast_client,
    )
    container.muse = lane.gateway
    gateway = lane.gateway
    autonomous = not settings.DEMO_MODE
    logger.info(
        "muse lane: client=%s (%s) model=%s budget=%s deterministic=%s "
        "autonomous_jobs=%s",
        type(client).__name__,
        client_kind(client),
        client_model(client),
        settings.MUSE_TOKEN_BUDGET,
        settings.MUSE_DETERMINISTIC,
        autonomous,
    )

    # M4: Notifier port, notify pipeline, second-order nudges
    container.notifier = MuseNotifier(lane)

    async def notify_move(move_id, force_ids=(), drop_ids=()):
        return await lane.call(
            NotifyService, "notify_move", move_id, force_ids, drop_ids
        )

    async def notify_preview(user_id, **kw):
        return await lane.call(NotifyService, "notify_preview", user_id, **kw)

    async def on_move_created(move_id: str) -> None:
        await lane.call(NotifyService, "on_move_created", move_id)

    async def on_move_joined(move_id: str, user_id: str) -> None:
        await lane.call(NotifyService, "on_move_joined", move_id, user_id)

    gateway.bind("notify_move", notify_move)
    gateway.bind("notify_preview", notify_preview)
    hooks.on_move_created.register(on_move_created)
    hooks.on_move_joined.register(on_move_joined)

    # M5: Move writer + place resolver behind compose_move / resolve_place
    async def compose_move(user_id, *, mark_id=None, seed_text=None, coarse=None):
        composed = await lane.call(
            ComposeService,
            "compose",
            user_id,
            mark_id=mark_id,
            seed_text=seed_text,
            coarse=coarse,
        )
        return composed.draft

    async def resolve_place(user_id, **kw):
        return await lane.call(ComposeService, "resolve_place", user_id, **kw)

    gateway.bind("compose_move", compose_move)
    gateway.bind("resolve_place", resolve_place)

    # M6: Move ranker (deterministic pairwise, domain/move_ranking.py)
    gateway.bind("rank_moves", MoveRanker(lane).rank_moves)

    # M7: flare / free-time agent, suggestion expiry
    flares = FlareScanner(lane)
    gateway.bind("run_flare_scan", flares.run_flare_scan)
    gateway.bind("run_free_time_scan", flares.run_free_time_scan)

    async def demo_flare_scan(user_id: str):
        return await _forced(flares.run_flare_scan, user_id)

    async def demo_free_time_scan(user_id: str):
        return await _forced(flares.run_free_time_scan, user_id)

    gateway.bind("demo_flare_scan", demo_flare_scan)
    gateway.bind("demo_free_time_scan", demo_free_time_scan)
    if autonomous:
        scheduler.register("muse_flare_scan", flares.scan_all, interval_s=60)

    async def expire_suggestions() -> int:
        return await lane.call(SuggestionService, "expire")

    scheduler.register("muse_expire_suggestions", expire_suggestions, interval_s=60)

    # M8: taste profiles learn from ratings
    async def on_rating_submitted(move_id: str, user_id: str) -> None:
        await lane.call(TasteService, "on_rating_submitted", move_id, user_id)

    hooks.on_rating_submitted.register(on_rating_submitted)

    # M9: pseudo-groups and revive (daily; Demo Control calls the scan directly)
    async def run_revive_scan(user_id: str):
        return await lane.call(ReviveService, "run_revive_scan", user_id)

    async def daily_pseudo_groups() -> int:
        with lane.session() as session:
            users = session.exec(
                select(UserSettings.user_id).where(UserSettings.muse_proactive)
            ).all()
        hits = 0
        for uid in users:
            hits += await run_revive_scan(uid) is not None
        return hits

    async def refresh_pseudo_groups(user_ids: list[str]) -> int:
        if hasattr(PseudoGroupService, "refresh_owners"):
            return await lane.call(PseudoGroupService, "refresh_owners", user_ids)
        changed = 0
        for uid in user_ids:
            changed += len(await lane.call(PseudoGroupService, "refresh", uid))
        return changed

    gateway.bind("run_revive_scan", run_revive_scan)
    gateway.bind("refresh_pseudo_groups", refresh_pseudo_groups)
    if autonomous:
        scheduler.register("muse_pseudo_groups", daily_pseudo_groups, interval_s=86400)

    # M10: nobody-bit path for quiet Moves
    async def run_nobody_bit(move_id: str):
        return await lane.call(NobodyBitService, "run", move_id)

    async def nobody_bit_scan() -> int:
        return await lane.call(NobodyBitService, "scan")

    gateway.bind("run_nobody_bit", run_nobody_bit)
    if autonomous:
        scheduler.register("muse_nobody_bit", nobody_bit_scan, interval_s=60)

    # M11: intent parser (glasses) and route suggestions
    async def intent(utterance: str):
        return await parse_intent(lane.runner, utterance)

    async def run_route(move_id: str, user_ids=()):
        return await lane.call(RouteService, "run_route", move_id, user_ids)

    gateway.bind("parse_intent", intent)
    gateway.bind("run_route", run_route)

    return lane
