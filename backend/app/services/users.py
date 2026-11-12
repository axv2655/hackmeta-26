"""People use cases: the login picker, settings, friends, blocks, auto-join
(ARCHITECTURE.md 5.1, 12.2, 14.2), plus the `UserGateway` port.

The service writes only core people tables. Visibility itself (who sees which
Move) lives in `domain/privacy.py`; a block here is the data it reads.

Errors are the core kinds from `app.domain.errors` (`UserNotFound` is a
`NotFound`, bad input is `Invalid`); `app/api/errors.py` maps them to statuses.
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from sqlalchemy import Engine
from sqlmodel import Session, col, delete, or_, select

from app.domain.errors import Invalid, NotFound
from app.ports import Clock
from app.tables import (
    AutojoinPref,
    Block,
    Circle,
    Friendship,
    Hangout,
    User,
    UserSettings,
)

FriendTier = Literal["close", "friend"]

# Hangouts in this window rank friends; the top fifth are "close" (10.1).
TIER_WINDOW = timedelta(days=90)
CLOSE_FRACTION = 0.2

SETTINGS_FIELDS = frozenset(UserSettings.model_fields) - {"user_id"}
NULLABLE_SETTINGS = frozenset({"quiet_hours"})


class UserNotFound(NotFound):
    def __init__(self, user_id: str) -> None:
        super().__init__(f"User {user_id!r} not found")


@dataclass(frozen=True, slots=True)
class Friend:
    user: User
    tier: FriendTier
    since: datetime
    hangouts: int


def require_users(
    session: Session, user_ids: Iterable[str], *, not_self: str | None = None
) -> list[User]:
    """Users for `user_ids` in the given order, de-duplicated.

    Raises `UserNotFound` for an unknown id and `Invalid` for `not_self`.
    """
    wanted = list(dict.fromkeys(user_ids))
    if not_self is not None and not_self in wanted:
        raise Invalid("You cannot pick yourself")
    found = {
        user.id: user
        for user in session.exec(select(User).where(col(User.id).in_(wanted)))
    }
    for user_id in wanted:
        if user_id not in found:
            raise UserNotFound(user_id)
    return [found[user_id] for user_id in wanted]


def close_friend_ids(counts: Mapping[str, int]) -> set[str]:
    """Top `CLOSE_FRACTION` of friends by hangouts (ties included, zero never)."""
    if not counts:
        return set()
    ranked = sorted(counts.values(), reverse=True)
    cutoff = ranked[math.ceil(len(ranked) * CLOSE_FRACTION) - 1]
    return {uid for uid, n in counts.items() if n > 0 and n >= cutoff}


class UserService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    # --- users and the login picker --------------------------------------

    def list_users(self) -> list[User]:
        return list(self._session.exec(select(User).order_by(col(User.name))))

    def get(self, user_id: str) -> User:
        user = self._session.get(User, user_id)
        if user is None:
            raise UserNotFound(user_id)
        return user

    # --- settings ---------------------------------------------------------

    def settings(self, user_id: str) -> UserSettings:
        """The user's settings row, created with the defaults on first read."""
        row = self._session.get(UserSettings, user_id)
        if row is None:
            self.get(user_id)
            row = UserSettings(user_id=user_id)
            self._session.add(row)
            self._session.commit()
            self._session.refresh(row)
        return row

    def update_settings(self, user_id: str, changes: Mapping[str, Any]) -> UserSettings:
        """Apply only the keys present; `quiet_hours` alone may be None."""
        if unknown := set(changes) - SETTINGS_FIELDS:
            raise Invalid(f"Unknown settings: {', '.join(sorted(unknown))}")
        nulled = {k for k, v in changes.items() if v is None} - NULLABLE_SETTINGS
        if nulled:
            raise Invalid(f"Cannot clear: {', '.join(sorted(nulled))}")
        if "default_circle_ids" in changes:
            self._check_owned_circles(user_id, changes["default_circle_ids"])
        row = self.settings(user_id)
        for name, value in changes.items():
            setattr(row, name, value)
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return row

    def _check_owned_circles(self, user_id: str, circle_ids: Collection[str]) -> None:
        owned = set(
            self._session.exec(
                select(Circle.id).where(
                    Circle.owner_id == user_id, col(Circle.id).in_(circle_ids)
                )
            )
        )
        if missing := set(circle_ids) - owned:
            raise Invalid(f"Not your Circles: {', '.join(sorted(missing))}")

    # --- friends ----------------------------------------------------------

    def friends(self, user_id: str) -> list[Friend]:
        """Friends with an affinity tier, close friends first, then by name."""
        rows = self._session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
            )
        ).all()
        since = {r.user_b if r.user_a == user_id else r.user_a: r.since for r in rows}
        counts = dict.fromkeys(since, 0) | self._recent_hangouts(user_id, since)
        close = close_friend_ids(counts)
        friends = [
            Friend(
                user=user,
                tier="close" if user.id in close else "friend",
                since=since[user.id],
                hangouts=counts[user.id],
            )
            for user in require_users(self._session, since)
        ]
        return sorted(friends, key=lambda f: (f.tier != "close", f.user.name))

    def _recent_hangouts(self, user_id: str, others: Collection[str]) -> Counter[str]:
        rows = self._session.exec(
            select(Hangout).where(
                or_(Hangout.user_a == user_id, Hangout.user_b == user_id),
                Hangout.at >= self._clock.now() - TIER_WINDOW,
            )
        )
        partners = (r.user_b if r.user_a == user_id else r.user_a for r in rows)
        return Counter(uid for uid in partners if uid in others)

    # --- blocks ("Hidden from") -------------------------------------------

    def blocked(self, user_id: str) -> list[User]:
        """People who never see `user_id`'s Moves."""
        return list(
            self._session.exec(
                select(User)
                .join(Block, col(Block.hidden_from_user_id) == col(User.id))
                .where(Block.user_id == user_id)
                .order_by(col(User.name))
            )
        )

    def block(self, user_id: str, other_id: str) -> None:
        """Idempotent. Hides every Move of `user_id` from `other_id`; the
        friendship itself stays."""
        require_users(self._session, [other_id], not_self=user_id)
        if self._session.get(Block, (user_id, other_id)) is None:
            self._session.add(Block(user_id=user_id, hidden_from_user_id=other_id))
            self._session.commit()

    def unblock(self, user_id: str, other_id: str) -> None:
        """Idempotent."""
        if row := self._session.get(Block, (user_id, other_id)):
            self._session.delete(row)
            self._session.commit()

    # --- auto-join --------------------------------------------------------

    def autojoin(self, user_id: str) -> list[User]:
        """People `user_id` may be silently auto-joined with (rule 1.5.5)."""
        return list(
            self._session.exec(
                select(User)
                .join(AutojoinPref, col(AutojoinPref.other_user_id) == col(User.id))
                .where(AutojoinPref.user_id == user_id)
                .order_by(col(User.name))
            )
        )

    def set_autojoin(self, user_id: str, other_ids: Iterable[str]) -> list[User]:
        """Replace the whole auto-join list."""
        others = require_users(self._session, other_ids, not_self=user_id)
        self._session.exec(
            delete(AutojoinPref).where(col(AutojoinPref.user_id) == user_id)
        )
        self._session.add_all(
            AutojoinPref(user_id=user_id, other_user_id=other.id) for other in others
        )
        self._session.commit()
        return self.autojoin(user_id)

    def add_autojoin(self, user_id: str, other_id: str) -> None:
        """Idempotent; "Always auto-join with X" on a proximity prompt (8.3)."""
        require_users(self._session, [user_id])
        require_users(self._session, [other_id], not_self=user_id)
        if self._session.get(AutojoinPref, (user_id, other_id)) is None:
            self._session.add(AutojoinPref(user_id=user_id, other_user_id=other_id))
            self._session.commit()


class SqlUserGateway:
    """`UserGateway` for other lanes; one short session per call."""

    def __init__(self, engine: Engine, clock: Clock) -> None:
        self._engine = engine
        self._clock = clock

    def add_autojoin(self, user_id: str, other_user_id: str) -> None:
        """Raises `UserNotFound` for an unknown user, `Invalid` for yourself."""
        with Session(self._engine) as session:
            UserService(session, self._clock).add_autojoin(user_id, other_user_id)
