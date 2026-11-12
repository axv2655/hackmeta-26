"""Move use cases (core C4): create, join, arrive, leave, end, end stale.

`MoveService` is the one writer of Moves. Every mutation follows the same
order (ARCHITECTURE.md 7.2, 7.3, 9.1):

1. load the Move and check the actor may see it (`MoveNotFound` otherwise,
   so a hidden Move is never confirmed),
2. ask `app.domain.moves` what changes, and write it through the repository,
3. commit,
4. publish realtime events to everyone who can see the Move,
5. fire the lifecycle hooks (`on_move_created`, `on_move_joined`,
   `on_move_ended`).

Events and hooks run only after the commit, so a subscriber that reads the
Move back (the proximity sweep, the notify pipeline) always finds it. A
failing publish is logged and skipped; hooks already swallow handler errors.

Events (`data` carries ids and states only, never coordinates; clients refetch
`GET /moves/{id}` for the rest):

* `move.created` on create: move_id, creator_id, mark_id, category, kind.
* `participant.changed` on join, arrive, leave: move_id, user_id, status,
  joined_via.
* `move.ended` on end, everyone left, stale: move_id, status, reason, ends_at.

`move.updated` is not emitted here: no Move field other than its status can
change, and status changes go out as `move.ended`.

Routes build one `MoveService` per request around `SessionDep`. Callers with
no request (other lanes' hooks, the scheduler) use `SqlMoveGateway`, which
opens one short session per call on the engine it was given.
"""

import logging
from collections.abc import Awaitable, Callable, Collection, Iterable
from dataclasses import dataclass, field
from functools import partial
from typing import Any

from sqlalchemy import Engine
from sqlmodel import Session

from app.domain import moves as rules
from app.domain.errors import IllegalTransition, MoveNotFound
from app.hooks import Hook, Hooks
from app.ports import (
    Clock,
    EndReason,
    EventPublisher,
    EventType,
    JoinedVia,
    MoveCreate,
    MoveSnapshot,
    ParticipantSnapshot,
    ParticipantStatus,
)
from app.repositories.audience import SqlAudienceRepository
from app.repositories.moves import SqlMoveRepository
from app.services.audience import AudiencePreview, AudienceService, CircleLabel
from app.tables import User

logger = logging.getLogger(__name__)

OPEN_BLE: JoinedVia = "open_ble"


@dataclass(frozen=True, slots=True)
class _Event:
    user_ids: frozenset[str]
    type: EventType
    data: dict[str, Any]


@dataclass(slots=True)
class _Outbox:
    """Side effects collected during a write, released after the commit."""

    events: list[_Event] = field(default_factory=list)
    hooks: list[Callable[[], Awaitable[None]]] = field(default_factory=list)

    def publish(
        self, user_ids: Iterable[str], type: EventType, data: dict[str, Any]
    ) -> None:
        self.events.append(_Event(frozenset(user_ids), type, data))

    def fire[**P](self, hook: Hook[P], *args: P.args, **kwargs: P.kwargs) -> None:
        self.hooks.append(partial(hook.fire, *args, **kwargs))


class MoveService:
    def __init__(
        self, session: Session, clock: Clock, events: EventPublisher, hooks: Hooks
    ) -> None:
        self.session = session
        self.clock = clock
        self.events = events
        self.hooks = hooks
        self.moves = SqlMoveRepository(session)
        self._audience_repo = SqlAudienceRepository(session)
        self.audience = AudienceService(self._audience_repo)

    # --- Reads ---------------------------------------------------------------

    def get(self, viewer_id: str, move_id: str) -> MoveSnapshot:
        """The Move if `viewer_id` may see it (any status), else `MoveNotFound`."""
        move = self.moves.get_visible(move_id, viewer_id)
        if move is None:
            raise MoveNotFound(move_id)
        return move

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        return self.moves.list_live_visible(viewer_id)

    def audience_ids(self, move_id: str) -> frozenset[str]:
        """The stored audience minus anyone the creator has blocked since
        posting: exactly the audience members `can_see` still admits, so the
        notify pipeline never reaches someone who cannot open the Move."""
        vis = self._audience_repo.move_visibility(move_id)
        if vis is None:
            return frozenset()
        return vis.audience_ids - vis.hidden_from_ids

    def audience_preview(self, move_id: str) -> AudiencePreview:
        """The audience as an AudienceLine (7.2), without later blocks. Show
        it to the Move's creator only."""
        ids = self.audience_ids(move_id)
        return AudiencePreview(
            count=len(ids),
            circles=tuple(
                CircleLabel(id=cid, name=name)
                for cid, name in self.moves.audience_circles(move_id)
            ),
            people=tuple(self._audience_repo.users(ids)),
        )

    def moments_counts(
        self, viewer_id: str, move_ids: Collection[str]
    ) -> dict[str, int]:
        """Moments the viewer may see per Move (missing means none)."""
        return self.moves.moments_counts(viewer_id, move_ids)

    def users(self, user_ids: Collection[str]) -> dict[str, User]:
        """Users by id, for showing creators and participants."""
        return {user.id: user for user in self._audience_repo.users(user_ids)}

    # --- Mutations -----------------------------------------------------------

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        """Validate, resolve the audience (C2), store the Move with its creator
        participant and audience (C3), then announce it. Raises `InvalidMove`,
        `MarkNotFound`, or `UnverifiedOpenMove` for an open Move by an
        unverified user (12.3)."""
        creator = self.session.get(User, creator_id)
        rules.require_may_post(
            draft, creator_verified=creator is not None and creator.fb_verified
        )
        new = rules.plan_move(creator_id, draft, self.clock.now())
        audience = self.audience.resolve(creator_id, draft.circle_ids, draft.user_ids)
        move = self.moves.create(new, audience)
        outbox = _Outbox()
        outbox.publish(
            self._viewers(move.id),
            "move.created",
            {
                "move_id": move.id,
                "creator_id": move.creator_id,
                "mark_id": move.mark.id,
                "category": move.category,
                "kind": move.kind,
            },
        )
        outbox.fire(self.hooks.on_move_created, move.id)
        await self._commit(outbox)
        return move

    async def join(
        self,
        user_id: str,
        move_id: str,
        status: ParticipantStatus = "going",
        joined_via: JoinedVia = "tap",
    ) -> MoveSnapshot:
        """Pull up (`going`) or join on the spot (`there`); idempotent.

        The user must be able to see the Move, except for an `open_ble` join,
        which needs an open Move, a verified user the creator has not blocked,
        and adds the user to the audience (8.5). Raises `MoveNotFound`,
        `IllegalTransition` (including a rejoin after leaving), `MoveNotOpen`,
        `MoveNotLive`. Fires `on_move_joined` only for a new participant.
        """
        move = self._load(user_id, move_id, discover=joined_via == OPEN_BLE)
        updated = rules.join(move, user_id, status, joined_via, self.clock.now())
        if updated is None:
            return move
        if joined_via == OPEN_BLE:
            self.moves.add_audience(move.id, user_id, OPEN_BLE)
        outbox = self._save_participant(move.id, updated)
        if rules.participant(move, user_id) is None:
            outbox.fire(self.hooks.on_move_joined, move.id, user_id)
        await self._commit(outbox)
        return rules.with_participant(move, updated)

    async def arrive(self, user_id: str, move_id: str) -> MoveSnapshot:
        """`going` -> `there`; a no-op if already there. Raises `MoveNotFound`,
        `NotParticipant`, `IllegalTransition`, `MoveNotLive`."""
        move = self._load(user_id, move_id)
        updated = rules.arrive(move, user_id, self.clock.now())
        if updated is None:
            return move
        await self._commit(self._save_participant(move.id, updated))
        return rules.with_participant(move, updated)

    async def leave(self, user_id: str, move_id: str) -> MoveSnapshot:
        """The user becomes a ghost; when that was the last participant the
        Move ends with `everyone_left`. Raises `MoveNotFound`, `NotParticipant`,
        `MoveNotLive`."""
        move = self._load(user_id, move_id)
        now = self.clock.now()
        updated = rules.leave(move, user_id, now)
        if updated is None:
            return move
        outbox = self._save_participant(move.id, updated)
        move = rules.with_participant(move, updated)
        if rules.everyone_left(move):
            move = self._record_end(
                rules.end(move, "everyone_left", now), "everyone_left", outbox
            )
        await self._commit(outbox)
        return move

    async def end(self, user_id: str, move_id: str) -> MoveSnapshot:
        """The creator ends their Move. Raises `MoveNotFound`, `NotMoveCreator`,
        `MoveNotLive`."""
        move = self._load(user_id, move_id)
        ended = rules.end(move, "creator", self.clock.now(), actor_id=user_id)
        return await self._end(ended, "creator")

    async def end_for_reason(self, move_id: str, reason: EndReason) -> MoveSnapshot:
        """End a Move on the system's behalf (other lanes, demo control). The
        reason's condition must hold (`EndNotAllowed`); `creator` acts as the
        creator. Raises `MoveNotFound`, `MoveNotLive`."""
        move = self.moves.get(move_id)
        if move is None:
            raise MoveNotFound(move_id)
        ended = rules.end(move, reason, self.clock.now(), actor_id=move.creator_id)
        return await self._end(ended, reason)

    async def end_stale(self) -> list[str]:
        """End every live Move idle for `STALE_AFTER`; returns their ids."""
        now = self.clock.now()
        outbox = _Outbox()
        ended: list[str] = []
        for move_id in self.moves.live_ids_started_before(rules.stale_cutoff(now)):
            move = self.moves.get(move_id)
            if move is not None and rules.is_stale(move, now):
                self._record_end(rules.end(move, "stale", now), "stale", outbox)
                ended.append(move_id)
        if ended:
            await self._commit(outbox)
        return ended

    # --- Helpers -------------------------------------------------------------

    def _load(
        self, user_id: str, move_id: str, *, discover: bool = False
    ) -> MoveSnapshot:
        """The Move if `user_id` may act on it; `discover` also admits an open
        Move found nearby (8.5, 12.3). Anything else is `MoveNotFound`."""
        move = self.moves.get(move_id)
        if move is None:
            raise MoveNotFound(move_id)
        if self.audience.can_see(user_id, move_id):
            return move
        if discover and move.open and self._may_discover(user_id, move.creator_id):
            return move
        raise MoveNotFound(move_id)

    def _may_discover(self, user_id: str, creator_id: str) -> bool:
        user = self.session.get(User, user_id)
        return (
            user is not None
            and user.fb_verified
            and user_id not in self._audience_repo.hidden_from(creator_id)
        )

    def _viewers(self, move_id: str) -> frozenset[str]:
        """Everyone `can_see` admits for the stored Move: the realtime audience."""
        vis = self._audience_repo.move_visibility(move_id)
        if vis is None:
            return frozenset()
        others = (vis.audience_ids | vis.participant_ids) - vis.hidden_from_ids
        return others | {vis.creator_id}

    def _save_participant(self, move_id: str, p: ParticipantSnapshot) -> _Outbox:
        self.moves.save_participant(move_id, p)
        outbox = _Outbox()
        outbox.publish(
            self._viewers(move_id),
            "participant.changed",
            {
                "move_id": move_id,
                "user_id": p.user_id,
                "status": p.status,
                "joined_via": p.joined_via,
            },
        )
        return outbox

    async def _end(self, ended: MoveSnapshot, reason: EndReason) -> MoveSnapshot:
        outbox = _Outbox()
        self._record_end(ended, reason, outbox)
        await self._commit(outbox)
        return ended

    def _record_end(
        self, ended: MoveSnapshot, reason: EndReason, outbox: _Outbox
    ) -> MoveSnapshot:
        assert ended.ends_at is not None
        self.moves.set_ended(ended.id, ended.status, ended.ends_at)
        outbox.publish(
            self._viewers(ended.id),
            "move.ended",
            {
                "move_id": ended.id,
                "status": ended.status,
                "reason": reason,
                "ends_at": ended.ends_at.isoformat(),
            },
        )
        outbox.fire(self.hooks.on_move_ended, ended.id)
        return ended

    async def _commit(self, outbox: _Outbox) -> None:
        self.session.commit()
        for event in outbox.events:
            try:
                await self.events.publish(event.user_ids, event.type, event.data)
            except Exception:
                logger.exception("publishing %s failed", event.type)
        for fire in outbox.hooks:
            await fire()


class SqlMoveGateway:
    """`MoveGateway` for other lanes and the scheduler: one short session per
    call on `engine`, the same rules as the routes.

    `add_participant` is how BLE joins arrive (proximity sweep, open Moves). A
    user who already left a Move is not pulled back in: the rejoin's
    `IllegalTransition` is logged and the call is a no-op, because an
    automatic sweep must never undo someone's choice to leave. Every other
    domain error propagates.
    """

    def __init__(
        self, engine: Engine, clock: Clock, events: EventPublisher, hooks: Hooks
    ) -> None:
        self._engine = engine
        self._clock = clock
        self._events = events
        self._hooks = hooks

    def _service(self, session: Session) -> MoveService:
        return MoveService(session, self._clock, self._events, self._hooks)

    def get(self, move_id: str) -> MoveSnapshot | None:
        """Any Move by id, no visibility check (consumers check themselves)."""
        with Session(self._engine) as session:
            return SqlMoveRepository(session).get(move_id)

    def audience_ids(self, move_id: str) -> frozenset[str]:
        with Session(self._engine) as session:
            return self._service(session).audience_ids(move_id)

    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]:
        with Session(self._engine) as session:
            return self._service(session).list_live_visible(viewer_id)

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        with Session(self._engine) as session:
            return await self._service(session).create(creator_id, draft)

    async def add_participant(
        self,
        move_id: str,
        user_id: str,
        status: ParticipantStatus,
        joined_via: JoinedVia,
    ) -> None:
        with Session(self._engine) as session:
            try:
                await self._service(session).join(user_id, move_id, status, joined_via)
            except IllegalTransition as exc:
                if exc.current != "left":
                    raise
                logger.info("not re-adding %s to move %s: left", user_id, move_id)

    async def end(self, move_id: str, reason: EndReason) -> None:
        with Session(self._engine) as session:
            await self._service(session).end_for_reason(move_id, reason)

    async def end_stale(self) -> list[str]:
        with Session(self._engine) as session:
            return await self._service(session).end_stale()
