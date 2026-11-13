"""Finding people and becoming friends.

    search    people by name or @username, with how they relate to you
              (friend, request sent, request received, none). People who
              blocked you, or you blocked, never show up.
    request   "Add friend". If they already asked you, you're friends now.
    accept    turn their request into a friendship
    decline   drop a request either way (theirs to you, or yours to them)
    unfriend  end a friendship

Sending and accepting tell the other person through the Notifier, so it
lands in their inbox, as a live banner, and as a phone push.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlmodel import Session, col, delete, or_, select

from app.domain.errors import Forbidden, Invalid, NotFound
from app.ports import Clock, Notifier
from app.tables import Block, Credential, FriendRequest, Friendship, User

Relation = Literal["self", "friend", "outgoing", "incoming", "none"]
SEARCH_LIMIT = 25


class PersonNotFound(NotFound):
    def __init__(self) -> None:
        super().__init__("No one with that id")


class CantFriendYourself(Invalid):
    def __init__(self) -> None:
        super().__init__("That's you")


class Blocked(Forbidden):
    def __init__(self) -> None:
        super().__init__("You can't add this person")


@dataclass(frozen=True, slots=True)
class Person:
    user: User
    username: str | None
    relation: Relation


@dataclass(frozen=True, slots=True)
class Pending:
    user: User
    username: str | None
    created_at: datetime


def _pair(a: str, b: str) -> tuple[str, str]:
    low, high = sorted((a, b))
    return low, high


class FriendService:
    def __init__(self, session: Session, clock: Clock, notifier: Notifier) -> None:
        self.session = session
        self.clock = clock
        self.notifier = notifier

    # --- reading ------------------------------------------------------------

    def search(self, me: str, q: str) -> list[Person]:
        q = q.strip().lstrip("@")
        if not q:
            return []
        hidden = self._blocked_either_way(me)
        like = f"%{q.lower()}%"
        query = (
            select(User, Credential.username)
            .join(Credential, col(Credential.user_id) == col(User.id), isouter=True)
            .where(
                or_(
                    col(User.name).ilike(like),
                    col(Credential.username).ilike(f"{q.lower()}%"),
                )
            )
            .where(col(User.id) != me)
            .order_by(col(User.name))
            .limit(SEARCH_LIMIT + len(hidden))
        )
        rows = [
            (u, name)
            for u, name in self.session.exec(query).all()
            if u.id not in hidden
        ]
        return [
            Person(u, name, self.relation(me, u.id)) for u, name in rows[:SEARCH_LIMIT]
        ]

    def relation(self, me: str, other: str) -> Relation:
        if me == other:
            return "self"
        if self.session.get(Friendship, _pair(me, other)) is not None:
            return "friend"
        if self.session.get(FriendRequest, (me, other)) is not None:
            return "outgoing"
        if self.session.get(FriendRequest, (other, me)) is not None:
            return "incoming"
        return "none"

    def requests(self, me: str) -> tuple[list[Pending], list[Pending]]:
        """(incoming, outgoing), newest first."""
        incoming = self._pending(col(FriendRequest.to_id) == me, "from_id")
        outgoing = self._pending(col(FriendRequest.from_id) == me, "to_id")
        return incoming, outgoing

    # --- changing -----------------------------------------------------------

    async def request(self, me: str, other: str) -> Relation:
        sender = self._person(me, other)
        current = self.relation(me, other)
        if current in ("friend", "outgoing"):
            return current
        if current == "incoming":
            return await self.accept(me, other)
        self.session.add(
            FriendRequest(from_id=me, to_id=other, created_at=self.clock.now())
        )
        self.session.commit()
        await self.notifier.send(
            other,
            "friend_request",
            f"{sender.first_name} sent you a friend request",
            f"{sender.name} wants to be friends on Moves.",
            {"user_id": me, "route": "/notifications"},
        )
        return "outgoing"

    async def accept(self, me: str, other: str) -> Relation:
        accepter = self._person(me, other)
        row = self.session.get(FriendRequest, (other, me))
        if row is None:
            return self.relation(me, other)
        self.session.delete(row)
        stale = self.session.get(FriendRequest, (me, other))
        if stale is not None:
            self.session.delete(stale)
        if self.session.get(Friendship, _pair(me, other)) is None:
            low, high = _pair(me, other)
            self.session.add(
                Friendship(user_a=low, user_b=high, since=self.clock.now())
            )
        self.session.commit()
        await self.notifier.send(
            other,
            "friend_accepted",
            f"{accepter.first_name} accepted your friend request",
            f"You and {accepter.name} are friends now. Send them a Move.",
            {"user_id": me, "route": "/moves"},
        )
        return "friend"

    def decline(self, me: str, other: str) -> None:
        self.session.exec(
            delete(FriendRequest).where(
                or_(
                    (col(FriendRequest.from_id) == other)
                    & (col(FriendRequest.to_id) == me),
                    (col(FriendRequest.from_id) == me)
                    & (col(FriendRequest.to_id) == other),
                )
            )
        )
        self.session.commit()

    def unfriend(self, me: str, other: str) -> None:
        row = self.session.get(Friendship, _pair(me, other))
        if row is not None:
            self.session.delete(row)
            self.session.commit()

    # --- helpers --------------------------------------------------------------

    def _person(self, me: str, other: str) -> User:
        """`me` as a User, after checking `other` can be befriended."""
        if me == other:
            raise CantFriendYourself()
        if self.session.get(User, other) is None:
            raise PersonNotFound()
        if other in self._blocked_either_way(me):
            raise Blocked()
        user = self.session.get(User, me)
        if user is None:
            raise PersonNotFound()
        return user

    def _blocked_either_way(self, me: str) -> set[str]:
        rows = self.session.exec(
            select(Block).where(
                or_(col(Block.user_id) == me, col(Block.hidden_from_user_id) == me)
            )
        ).all()
        return {b.hidden_from_user_id if b.user_id == me else b.user_id for b in rows}

    def _pending(self, where, other_field: str) -> list[Pending]:
        rows = self.session.exec(
            select(FriendRequest)
            .where(where)
            .order_by(col(FriendRequest.created_at).desc())
        ).all()
        out: list[Pending] = []
        for r in rows:
            other_id = getattr(r, other_field)
            user = self.session.get(User, other_id)
            if user is None:
                continue
            cred = self.session.exec(
                select(Credential).where(col(Credential.user_id) == other_id)
            ).first()
            out.append(Pending(user, cred.username if cred else None, r.created_at))
        return out
