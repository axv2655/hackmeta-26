"""Moment/tag persistence; consent decisions remain in the domain/service."""
from typing import Protocol

from sqlmodel import col, select

from app.domain.records import Moment as MomentRecord
from app.domain.records import MomentTag as TagRecord
from app.repositories.records import record, store
from app.tables import Moment, MomentTag


class MomentsRepository(Protocol):
    def get(self, mid: str) -> MomentRecord | None: ...
    def list_for_move(self, mid: str) -> list[MomentRecord]: ...
    def tags(self, mid: str) -> list[TagRecord]: ...
    def get_tag(self, mid: str, uid: str) -> TagRecord | None: ...
    def put(self, value: MomentRecord) -> None: ...
    def put_tag(self, value: TagRecord) -> None: ...


class SqlMomentsRepository:
    def __init__(self, session):
        self.session = session

    def get(self, mid):
        return record(self.session.get(Moment, mid))

    def list_for_move(self, mid):
        rows = self.session.exec(select(Moment).where(Moment.move_id == mid)
                                 .order_by(col(Moment.created_at), col(Moment.id)))
        return [record(r) for r in rows]

    def tags(self, mid):
        rows = self.session.exec(select(MomentTag).where(MomentTag.moment_id == mid)
                                 .order_by(col(MomentTag.user_id)))
        return [record(r) for r in rows]

    def get_tag(self, mid, uid):
        return record(self.session.get(MomentTag, (mid, uid)))

    def put(self, value):
        store(self.session, value)

    def put_tag(self, value):
        store(self.session, value)
