"""People persistence; returns detached values, never ORM identities."""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Protocol

from sqlmodel import col, delete, or_, select

from app.domain.records import User as Person
from app.domain.records import UserSettings as Settings
from app.repositories.records import record, store
from app.tables import (
    AutojoinPref,
    Block,
    Circle,
    Friendship,
    Hangout,
    User,
    UserSettings,
)


class UsersRepository(Protocol):
    def get(self, uid: str) -> Person | None: ...
    def list(self) -> list[Person]: ...
    def get_settings(self, uid: str) -> Settings | None: ...
    def put_settings(self, value: Settings) -> None: ...
    def put_user(self, value: Person) -> None: ...
    def owned_circle_ids(self, uid: str) -> set[str]: ...
    def friendships(self, uid: str) -> dict[str, datetime]: ...
    def hangout_partners(self, uid: str, since: datetime) -> list[str]: ...
    def blocked(self, uid: str) -> list[Person]: ...
    def block(self, uid: str, other: str) -> None: ...
    def unblock(self, uid: str, other: str) -> None: ...
    def autojoin(self, uid: str) -> list[Person]: ...
    def replace_autojoin(self, uid: str, others: Iterable[str]) -> None: ...
    def add_autojoin(self, uid: str, other: str) -> None: ...


class SqlUsersRepository:
    def __init__(self, session):
        self.session = session

    def get(self, uid):
        return record(self.session.get(User, uid))

    def list(self):
        return [
            record(u) for u in self.session.exec(select(User).order_by(col(User.name)))
        ]

    def get_settings(self, uid):
        return record(self.session.get(UserSettings, uid))

    def put_settings(self, value):
        store(self.session, value)

    def put_user(self, value):
        store(self.session, value)

    def owned_circle_ids(self, uid):
        return set(self.session.exec(select(Circle.id).where(Circle.owner_id == uid)))

    def friendships(self, uid):
        rows = self.session.exec(select(Friendship).where(or_(
            Friendship.user_a == uid, Friendship.user_b == uid)))
        return {r.user_b if r.user_a == uid else r.user_a: r.since for r in rows}

    def hangout_partners(self, uid, since):
        rows = self.session.exec(select(Hangout).where(or_(
            Hangout.user_a == uid, Hangout.user_b == uid), Hangout.at >= since))
        return [r.user_b if r.user_a == uid else r.user_a for r in rows]

    def blocked(self, uid):
        rows = self.session.exec(select(User).join(
            Block, col(Block.hidden_from_user_id) == col(User.id)
        ).where(Block.user_id == uid).order_by(col(User.name)))
        return [record(u) for u in rows]

    def block(self, uid, other):
        if self.session.get(Block, (uid, other)) is None:
            self.session.add(Block(user_id=uid, hidden_from_user_id=other))

    def unblock(self, uid, other):
        if row := self.session.get(Block, (uid, other)):
            self.session.delete(row)

    def autojoin(self, uid):
        rows = self.session.exec(select(User).join(
            AutojoinPref, col(AutojoinPref.other_user_id) == col(User.id)
        ).where(AutojoinPref.user_id == uid).order_by(col(User.name)))
        return [record(u) for u in rows]

    def replace_autojoin(self, uid, others):
        self.session.exec(delete(AutojoinPref).where(col(AutojoinPref.user_id) == uid))
        for other in others:
            self.add_autojoin(uid, other)

    def add_autojoin(self, uid, other):
        if self.session.get(AutojoinPref, (uid, other)) is None:
            self.session.add(AutojoinPref(user_id=uid, other_user_id=other))
