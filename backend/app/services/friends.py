"""Finding people and becoming friends.

    search       people by name or @username, with how they relate to you
                 (friend, request sent, request received, none) and how many
                 friends you share. People who blocked you, or you blocked,
                 never show up.
    suggestions  "People you may know": friends of friends by mutual count,
                 padded with everyone else so a new account always sees people.
    profile      one person: relation, mutual friends, friend count and the
                 live Moves of theirs you can already see. Never coordinates.
    request      "Add friend". If they already asked you, you're friends now.
    accept       turn their request into a friendship
    decline      drop a request either way (theirs to you, or yours to them)
    unfriend     end a friendship, and take each out of the other's Circles
                 and auto-join list

Sending and accepting tell the other person through the Notifier, so it
lands in their inbox, as a live banner, and as a phone push.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlmodel import Session, col, delete, or_, select

from app.domain.errors import Forbidden, Invalid, NotFound
from app.ports import Category, Clock, MoveSnapshot, Notifier, ParticipantStatus
from app.repositories.moves import SqlMoveRepository
from app.repositories.users import SqlUsersRepository
from app.tables import Block, Credential, FriendRequest, Friendship, User

Relation = Literal["self", "friend", "outgoing", "incoming", "none"]
SEARCH_LIMIT = 25
PROFILE_MUTUALS = 6


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
    mutual_count: int = 0


@dataclass(frozen=True, slots=True)
class Pending:
    user: User
    username: str | None
    created_at: datetime
    mutual_count: int = 0


@dataclass(frozen=True, slots=True)
class ProfileMove:
    """A light, coordinate-free view of one live Move on a profile."""

    id: str
    text: str
    category: Category
    mark_id: str
    mark_name: str
    starts_at: datetime
    my_status: ParticipantStatus | None


@dataclass(frozen=True, slots=True)
class Profile:
    user: User
    username: str | None
    relation: Relation
    mutual_count: int
    mutual: tuple[User, ...]
    friend_count: int
    moves: tuple[ProfileMove, ...]


def _pair(a: str, b: str) -> tuple[str, str]:
    low, high = sorted((a, b))
    return low, high


def _profile_move(viewer: str, move: MoveSnapshot) -> ProfileMove:
    mine = next((p for p in move.participants if p.user_id == viewer), None)
    return ProfileMove(
        id=move.id,
        text=move.text,
        category=move.category,
        mark_id=move.mark.id,
        mark_name=move.mark.name,
        starts_at=move.starts_at,
        my_status=mine.status if mine else None,
    )


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
        mine = self.friend_ids(me)
        return [
            Person(u, name, self.relation(me, u.id), self._mutual(mine, u.id))
            for u, name in rows[:SEARCH_LIMIT]
        ]

    def suggestions(self, me: str, limit: int = 10) -> list[Person]:
        """Friends of friends, most mutual friends first (then by name),
        padded with other people (mutual 0, by name) up to `limit`. Never
        yourself, friends, anyone with a pending request either way, or
        anyone blocked either way."""
        mine = self.friend_ids(me)
        skip = {me} | mine | self._pending_ids(me) | self._blocked_either_way(me)
        counts: Counter[str] = Counter()
        for friend in mine:
            counts.update(self.friend_ids(friend) - skip)
        ranked = [self.session.get(User, uid) for uid in counts]
        picks = sorted(
            (u for u in ranked if u is not None),
            key=lambda u: (-counts[u.id], u.name, u.id),
        )[:limit]
        picks += self._others(skip | {u.id for u in picks}, limit - len(picks))
        names = SqlUsersRepository(self.session).usernames(u.id for u in picks)
        return [Person(u, names.get(u.id), "none", counts[u.id]) for u in picks]

    def profile(self, me: str, other: str) -> Profile:
        """404 (`PersonNotFound`) for an unknown id or a block either way."""
        user = self.session.get(User, other)
        if user is None or other in self._blocked_either_way(me):
            raise PersonNotFound()
        theirs = self.friend_ids(other)
        common = [self.session.get(User, uid) for uid in theirs & self.friend_ids(me)]
        shared = sorted(
            (u for u in common if u is not None), key=lambda u: (u.name, u.id)
        )
        visible = SqlMoveRepository(self.session).list_live_visible(me)
        return Profile(
            user=user,
            username=SqlUsersRepository(self.session).usernames([other]).get(other),
            relation=self.relation(me, other),
            mutual_count=0 if me == other else len(shared),
            mutual=() if me == other else tuple(shared[:PROFILE_MUTUALS]),
            friend_count=len(theirs),
            moves=tuple(_profile_move(me, m) for m in visible if m.creator_id == other),
        )

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
        mine = self.friend_ids(me)
        incoming = self._pending(col(FriendRequest.to_id) == me, "from_id", mine)
        outgoing = self._pending(col(FriendRequest.from_id) == me, "to_id", mine)
        return incoming, outgoing

    def friend_ids(self, uid: str) -> set[str]:
        return set(SqlUsersRepository(self.session).friendships(uid))

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
            {"user_id": me, "route": "/friends"},
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
            {"user_id": me, "route": f"/user/{me}"},
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
        """Ends the friendship and takes each out of the other's Circles and
        auto-join list (both hold friends only)."""
        repo = SqlUsersRepository(self.session)
        repo.drop_friendship(me, other)
        repo.drop_from_owned_circles(me, other)
        repo.drop_from_owned_circles(other, me)
        repo.drop_autojoin_pair(me, other)
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

    def _mutual(self, mine: set[str], other: str) -> int:
        return len(mine & self.friend_ids(other))

    def _others(self, skip: set[str], count: int) -> list[User]:
        if count <= 0:
            return []
        query = (
            select(User)
            .where(col(User.id).not_in(skip))
            .order_by(col(User.name), col(User.id))
            .limit(count)
        )
        return list(self.session.exec(query).all())

    def _pending_ids(self, me: str) -> set[str]:
        rows = self.session.exec(
            select(FriendRequest).where(
                or_(col(FriendRequest.from_id) == me, col(FriendRequest.to_id) == me)
            )
        ).all()
        return {r.to_id if r.from_id == me else r.from_id for r in rows}

    def _blocked_either_way(self, me: str) -> set[str]:
        rows = self.session.exec(
            select(Block).where(
                or_(col(Block.user_id) == me, col(Block.hidden_from_user_id) == me)
            )
        ).all()
        return {b.hidden_from_user_id if b.user_id == me else b.user_id for b in rows}

    def _pending(self, where, other_field: str, mine: set[str]) -> list[Pending]:
        rows = self.session.exec(
            select(FriendRequest)
            .where(where)
            .order_by(col(FriendRequest.created_at).desc())
        ).all()
        ids = [getattr(r, other_field) for r in rows]
        names = SqlUsersRepository(self.session).usernames(ids)
        out: list[Pending] = []
        for r, other_id in zip(rows, ids, strict=True):
            user = self.session.get(User, other_id)
            if user is None:
                continue
            mutual = self._mutual(mine, other_id)
            out.append(Pending(user, names.get(other_id), r.created_at, mutual))
        return out
