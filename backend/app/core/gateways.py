"""Session-scoped SQL implementations of cross-lane ports."""

import logging

from sqlalchemy import Engine
from sqlmodel import Session

from app.core.composition import (
    build_mark_service,
    build_move_service,
    build_user_service,
)
from app.domain.errors import IllegalTransition
from app.hooks import Hooks
from app.ports import (
    Clock,
    EndReason,
    EventPublisher,
    JoinedVia,
    MarkSnapshot,
    MoveCreate,
    MoveSnapshot,
    ParticipantStatus,
    SaveSource,
)
from app.repositories.moves import SqlMoveRepository
from app.services.marks import MarkService
from app.services.moves import MoveService

logger = logging.getLogger(__name__)


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
        return build_move_service(session, self._clock, self._events, self._hooks)

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


class SqlUserGateway:
    """`UserGateway` for other lanes; one short session per call."""

    def __init__(self, engine: Engine, clock: Clock) -> None:
        self._engine = engine
        self._clock = clock

    def add_autojoin(self, user_id: str, other_user_id: str) -> None:
        """Raises `UserNotFound` for an unknown user, `Invalid` for yourself."""
        with Session(self._engine) as session:
            build_user_service(session, self._clock).add_autojoin(
                user_id, other_user_id
            )


class SqlMarkGateway:
    """`MarkGateway` for other lanes; one short session per call."""

    def __init__(self, engine: Engine, clock: Clock) -> None:
        self._engine = engine
        self._clock = clock

    def _service(self, session: Session) -> MarkService:
        return build_mark_service(session, self._clock)

    def get(self, mark_id: str) -> MarkSnapshot | None:
        with Session(self._engine) as session:
            return self._service(session).get(mark_id)

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        with Session(self._engine) as session:
            return self._service(session).nearest(lat, lng, limit)

    def save(
        self, user_id: str, mark_id: str, source: SaveSource, source_ref: str | None
    ) -> None:
        """Raises `MarkNotFound` for an unknown Mark."""
        with Session(self._engine) as session:
            self._service(session).save(user_id, mark_id, source, source_ref)

    def unsave(self, user_id: str, mark_id: str) -> None:
        with Session(self._engine) as session:
            self._service(session).unsave(user_id, mark_id)

    def mark_flared(self, user_id: str, mark_id: str) -> None:
        with Session(self._engine) as session:
            self._service(session).mark_flared(user_id, mark_id)
