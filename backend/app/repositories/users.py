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
    CalendarEvent,
    Circle,
    CircleMember,
    Credential,
    FriendRequest,
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
    def usernames(self, uids: Iterable[str]) -> dict[str, str]: ...
    def drop_friendship(self, uid: str, other: str) -> None: ...
    def drop_autojoin_pair(self, uid: str, other: str) -> None: ...
    def drop_from_owned_circles(self, owner: str, member: str) -> None: ...
    def clear_device_calendar(self, uid: str) -> None: ...


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
        rows = self.session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == uid, Friendship.user_b == uid)
            )
        )
        return {r.user_b if r.user_a == uid else r.user_a: r.since for r in rows}

    def hangout_partners(self, uid, since):
        rows = self.session.exec(
            select(Hangout).where(
                or_(Hangout.user_a == uid, Hangout.user_b == uid), Hangout.at >= since
            )
        )
        return [r.user_b if r.user_a == uid else r.user_a for r in rows]

    def blocked(self, uid):
        rows = self.session.exec(
            select(User)
            .join(Block, col(Block.hidden_from_user_id) == col(User.id))
            .where(Block.user_id == uid)
            .order_by(col(User.name))
        )
        return [record(u) for u in rows]

    def block(self, uid, other):
        if self.session.get(Block, (uid, other)) is None:
            self.session.add(Block(user_id=uid, hidden_from_user_id=other))

    def unblock(self, uid, other):
        if row := self.session.get(Block, (uid, other)):
            self.session.delete(row)

    def autojoin(self, uid):
        rows = self.session.exec(
            select(User)
            .join(AutojoinPref, col(AutojoinPref.other_user_id) == col(User.id))
            .where(AutojoinPref.user_id == uid)
            .order_by(col(User.name))
        )
        return [record(u) for u in rows]

    def replace_autojoin(self, uid, others):
        self.session.exec(delete(AutojoinPref).where(col(AutojoinPref.user_id) == uid))
        for other in others:
            self.add_autojoin(uid, other)

    def add_autojoin(self, uid, other):
        if self.session.get(AutojoinPref, (uid, other)) is None:
            self.session.add(AutojoinPref(user_id=uid, other_user_id=other))

    def usernames(self, uids):
        wanted = list(uids)
        if not wanted:
            return {}
        rows = self.session.exec(
            select(Credential).where(col(Credential.user_id).in_(wanted))
        )
        return {r.user_id: r.username for r in rows}

    def drop_friendship(self, uid, other):
        """The friendship and any pending request, either direction."""
        low, high = sorted((uid, other))
        if row := self.session.get(Friendship, (low, high)):
            self.session.delete(row)
        for sender, to in ((uid, other), (other, uid)):
            if req := self.session.get(FriendRequest, (sender, to)):
                self.session.delete(req)
        self.session.flush()

    def drop_autojoin_pair(self, uid, other):
        for a, b in ((uid, other), (other, uid)):
            if row := self.session.get(AutojoinPref, (a, b)):
                self.session.delete(row)
        self.session.flush()

    def drop_from_owned_circles(self, owner, member):
        owned = select(Circle.id).where(Circle.owner_id == owner)
        self.session.exec(
            delete(CircleMember).where(
                col(CircleMember.user_id) == member,
                col(CircleMember.circle_id).in_(owned),
            )
        )
        self.session.flush()

    def clear_device_calendar(self, uid):
        """Phone busy blocks are the rows with no title and no location."""
        self.session.exec(
            delete(CalendarEvent).where(
                col(CalendarEvent.user_id) == uid,
                col(CalendarEvent.title).is_(None),
                col(CalendarEvent.location).is_(None),
            )
        )
        self.session.flush()
