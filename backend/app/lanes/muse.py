"""Wires the muse lane into the app. Only the muse lane edits this file.

Registers: Notifier (M4) and MuseGateway (M1+); handlers on on_move_created,
on_move_joined (M4) and on_rating_submitted (M8); flare, revive and nobody-bit
jobs (M7, M9, M10).

`register(..., engine=..., client=...)` lets tests wire the lane onto an
in-memory database with a `FakeMuseClient`.
"""

from sqlalchemy import Engine
from sqlmodel import select

from app.container import Container
from app.core import db
from app.hooks import Hooks
from app.muse.agents.flare import FlareScanner
from app.muse.agents.intent import parse_intent
from app.muse.agents.move_ranker import MoveRanker
from app.muse.agents.nobody_bit import NobodyBitService
from app.muse.agents.revive import ReviveService
from app.muse.agents.route import RouteService
from app.muse.client import MuseClient, client_from_settings
from app.muse.compose import ComposeService
from app.muse.lane import MuseLane
from app.scheduler.loop import Scheduler
from app.services.notify import MuseNotifier, NotifyService
from app.services.suggestions import SuggestionService
from app.services.taste import TasteService
from app.tables import UserSettings


def register(
    container: Container,
    hooks: Hooks,
    scheduler: Scheduler,
    *,
    engine: Engine | None = None,
    client: MuseClient | None = None,
) -> MuseLane:
    # M1: runner, client and the MuseGateway port
    lane = MuseLane.build(
        engine or db.engine, container, client or client_from_settings()
    )
    container.muse = lane.gateway
    gateway = lane.gateway

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

    # M6: Move ranker (45 s per-user cache)
    gateway.bind("rank_moves", MoveRanker(lane).rank_moves)

    # M7: flare / free-time agent, suggestion expiry
    flares = FlareScanner(lane)
    gateway.bind("run_flare_scan", flares.run_flare_scan)
    gateway.bind("run_free_time_scan", flares.run_free_time_scan)
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

    gateway.bind("run_revive_scan", run_revive_scan)
    scheduler.register("muse_pseudo_groups", daily_pseudo_groups, interval_s=86400)

    # M10: nobody-bit path for quiet Moves
    async def run_nobody_bit(move_id: str):
        return await lane.call(NobodyBitService, "run", move_id)

    async def nobody_bit_scan() -> int:
        return await lane.call(NobodyBitService, "scan")

    gateway.bind("run_nobody_bit", run_nobody_bit)
    scheduler.register("muse_nobody_bit", nobody_bit_scan, interval_s=60)

    # M11: intent parser (glasses) and route suggestions
    async def intent(utterance: str):
        return await parse_intent(lane.runner, utterance)

    async def run_route(move_id: str, user_ids=()):
        return await lane.call(RouteService, "run_route", move_id, user_ids)

    async def route_on_join(move_id: str, user_id: str) -> None:
        await run_route(move_id, ())

    gateway.bind("parse_intent", intent)
    gateway.bind("run_route", run_route)
    hooks.on_move_joined.register(route_on_join)

    return lane
