"""A single session owns a core mutation; services see only this contract."""
from typing import Protocol

from app.repositories.audience import AudienceRepository, SqlAudienceRepository
from app.repositories.circles import CirclesRepository, SqlCirclesRepository
from app.repositories.moments import MomentsRepository, SqlMomentsRepository
from app.repositories.moves import MoveRepository, SqlMoveRepository
from app.repositories.users import SqlUsersRepository, UsersRepository


class CoreUnitOfWork(Protocol):
    moments: MomentsRepository
    users: UsersRepository
    circles: CirclesRepository
    moves: MoveRepository
    audience: AudienceRepository

    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def refresh(self) -> None: ...


class SqlCoreUnitOfWork:
    def __init__(self, session):
        self.session = session
        self.moments = SqlMomentsRepository(session)
        self.users = SqlUsersRepository(session)
        self.circles = SqlCirclesRepository(session)
        self.moves = SqlMoveRepository(session)
        self.audience = SqlAudienceRepository(session)

    def commit(self):
        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

    def rollback(self):
        self.session.rollback()

    def refresh(self):
        self.session.rollback()
        self.session.expire_all()
