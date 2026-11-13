"""Composition boundary: the one place SQL adapters meet the core services.

Routes (one session per request) and gateways (one short session per call)
both build services here, so neither constructs repositories itself and the
services only ever see the `CoreUnitOfWork` contract.
"""

from pathlib import Path

from sqlmodel import Session

from app.hooks import Hooks
from app.ports import Clock, EventPublisher, Notifier
from app.repositories.marks import SqlMarkRepository
from app.repositories.media import LocalMediaStore
from app.repositories.unit_of_work import SqlCoreUnitOfWork
from app.services.circles import CircleService
from app.services.marks import MarkService
from app.services.moments import MomentService
from app.services.moves import MoveService
from app.services.users import UserService


def build_move_service(
    session: Session, clock: Clock, events: EventPublisher, hooks: Hooks
) -> MoveService:
    return MoveService(SqlCoreUnitOfWork(session), clock, events, hooks)


def build_user_service(session: Session, clock: Clock) -> UserService:
    return UserService(SqlCoreUnitOfWork(session), clock)


def build_circle_service(session: Session) -> CircleService:
    return CircleService(SqlCoreUnitOfWork(session))


def build_mark_service(session: Session, clock: Clock) -> MarkService:
    return MarkService(SqlMarkRepository(session), clock)


def build_moment_service(
    session: Session,
    clock: Clock,
    events: EventPublisher,
    notifier: Notifier,
    media_dir: Path,
    *,
    media_url_prefix: str,
) -> MomentService:
    return MomentService(
        SqlCoreUnitOfWork(session),
        clock,
        events,
        notifier,
        LocalMediaStore(media_dir),
        media_url_prefix=media_url_prefix,
    )

