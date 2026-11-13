"""Circle persistence, without ownership or validation policy."""

from collections.abc import Iterable
from typing import Protocol

from sqlmodel import col, delete, select

from app.domain.records import Circle as CircleRecord
from app.domain.records import User as Person
from app.repositories.records import record, store
from app.tables import Circle, CircleMember, User


class CirclesRepository(Protocol):
    def get(self, cid: str) -> CircleRecord | None: ...
    def list_owned(self, uid: str) -> list[CircleRecord]: ...
    def put(self, value: CircleRecord) -> None: ...
    def delete(self, cid: str) -> None: ...
    def replace_members(self, cid: str, ids: Iterable[str]) -> None: ...
    def members(self, cid: str) -> list[Person]: ...


class SqlCirclesRepository:
    def __init__(self, session):
        self.session = session

    def get(self, cid):
        return record(self.session.get(Circle, cid))

    def list_owned(self, uid):
        return [
            record(r)
            for r in self.session.exec(
                select(Circle).where(Circle.owner_id == uid).order_by(col(Circle.name))
            )
        ]

    def put(self, value):
        store(self.session, value)

    def delete(self, cid):
        self.session.delete(self.session.get(Circle, cid))

    def replace_members(self, cid, ids):
        self.session.exec(
            delete(CircleMember).where(col(CircleMember.circle_id) == cid)
        )
        self.session.add_all(CircleMember(circle_id=cid, user_id=uid) for uid in ids)
        self.session.flush()

    def members(self, cid):
        rows = self.session.exec(
            select(User)
            .join(CircleMember, col(CircleMember.user_id) == col(User.id))
            .where(CircleMember.circle_id == cid)
            .order_by(col(User.name))
        )
        return [record(r) for r in rows]
