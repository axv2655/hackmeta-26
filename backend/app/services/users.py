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
from dataclasses import dataclass, fields, replace
from datetime import datetime, timedelta
from typing import Any, Literal

from app.core.areas import coarse_area
from app.domain.accounts import clean_display_name, first_word
from app.domain.errors import Invalid, NotFound
from app.domain.records import User, UserSettings
from app.ports import Clock
from app.repositories.unit_of_work import CoreUnitOfWork
from app.repositories.users import UsersRepository

FriendTier = Literal["close", "friend"]

# Hangouts in this window rank friends; the top fifth are "close" (10.1).
TIER_WINDOW = timedelta(days=90)
CLOSE_FRACTION = 0.2

SETTINGS_FIELDS = frozenset(f.name for f in fields(UserSettings)) - {"user_id"}
NULLABLE_SETTINGS = frozenset({"quiet_hours"})


class UserNotFound(NotFound):
    def __init__(self, user_id: str) -> None:
        super().__init__(f"User {user_id!r} not found")


class NotAFriend(Invalid):
    """Circles and auto-join lists hold friends only."""

    def __init__(self, user_ids: Iterable[str]) -> None:
        names = ", ".join(sorted(user_ids))
        super().__init__(f"Only friends can be added: {names}")


@dataclass(frozen=True, slots=True)
class Friend:
    user: User
    tier: FriendTier
    since: datetime
    hangouts: int
    username: str | None = None


def require_users(
    repository: UsersRepository, user_ids: Iterable[str], *, not_self: str | None = None
) -> list[User]:
    """Users for `user_ids` in the given order, de-duplicated.

    Raises `UserNotFound` for an unknown id and `Invalid` for `not_self`.
    """
    wanted = list(dict.fromkeys(user_ids))
    if not_self is not None and not_self in wanted:
        raise Invalid("You cannot pick yourself")
    found = {
        user.id: user for uid in wanted if (user := repository.get(uid)) is not None
    }
    for user_id in wanted:
        if user_id not in found:
            raise UserNotFound(user_id)
    return [found[user_id] for user_id in wanted]


def require_friends(
    repository: UsersRepository, owner_id: str, user_ids: Iterable[str]
) -> None:
    """Raises `NotAFriend` unless every id is a friend of `owner_id`."""
    if strangers := set(user_ids) - set(repository.friendships(owner_id)):
        raise NotAFriend(strangers)


def close_friend_ids(counts: Mapping[str, int]) -> set[str]:
    """Top `CLOSE_FRACTION` of friends by hangouts (ties included, zero never)."""
    if not counts:
        return set()
    ranked = sorted(counts.values(), reverse=True)
    cutoff = ranked[math.ceil(len(ranked) * CLOSE_FRACTION) - 1]
    return {uid for uid, n in counts.items() if n > 0 and n >= cutoff}


class UserService:
    def __init__(self, uow: CoreUnitOfWork, clock: Clock) -> None:
        self.uow = uow
        self.repo = uow.users
        self._clock = clock

    # --- users and the login picker --------------------------------------

    def list_users(self) -> list[User]:
        return self.repo.list()

    def get(self, user_id: str) -> User:
        user = self.repo.get(user_id)
        if user is None:
            raise UserNotFound(user_id)
        return user

    # --- profile ----------------------------------------------------------

    def update_profile(self, user_id: str, name: str) -> User:
        """Rename: trimmed, 1 to 60 characters; the first word is the first name."""
        cleaned = clean_display_name(name)
        user = replace(self.get(user_id), name=cleaned, first_name=first_word(cleaned))
        self.repo.put_user(user)
        self.uow.commit()
        return user

    def verify(self, user_id: str) -> User:
        """The mock "Verify with Facebook": marks the account verified."""
        user = replace(self.get(user_id), fb_verified=True)
        self.repo.put_user(user)
        self.uow.commit()
        return user

    # --- settings ---------------------------------------------------------

    def settings(self, user_id: str) -> UserSettings:
        row = self.repo.get_settings(user_id)
        if row is None:
            self.get(user_id)
            row = UserSettings(user_id=user_id)
            self.repo.put_settings(row)
            self.uow.commit()
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
        row = replace(row, **changes)
        self.repo.put_settings(row)
        if not row.location_opt_in:
            self._set_last_area(user_id, None)  # opting out forgets the area
        if changes.get("calendar_opt_in") is False:
            self.repo.clear_device_calendar(user_id)  # and the phone's busy blocks
        self.uow.commit()
        return row

    def record_near_area(self, user_id: str, lat: float, lng: float) -> None:
        """Remember only the coarse area label of a nearby query, and only for
        a user who opted in. The coordinates are not kept: no opt-in, no write;
        a point outside every supported area stores no label."""
        if not self.settings(user_id).location_opt_in:
            return
        if self._set_last_area(user_id, coarse_area(lat, lng)):
            self.uow.commit()

    def _set_last_area(self, user_id: str, area: str | None) -> bool:
        person = self.repo.get(user_id)
        if person is None or person.last_area == area:
            return False
        self.repo.put_user(replace(person, last_area=area))
        return True

    def _check_owned_circles(self, user_id: str, circle_ids: Collection[str]) -> None:
        if missing := set(circle_ids) - self.repo.owned_circle_ids(user_id):
            raise Invalid(f"Not your Circles: {', '.join(sorted(missing))}")

    # --- friends ----------------------------------------------------------

    def friends(self, user_id: str) -> list[Friend]:
        """Friends with an affinity tier, close friends first, then by name."""
        since = self.repo.friendships(user_id)
        counts = dict.fromkeys(since, 0) | self._recent_hangouts(user_id, since)
        close = close_friend_ids(counts)
        usernames = self.repo.usernames(since)
        friends = [
            Friend(
                user=user,
                tier="close" if user.id in close else "friend",
                since=since[user.id],
                hangouts=counts[user.id],
                username=usernames.get(user.id),
            )
            for user in require_users(self.repo, since)
        ]
        return sorted(friends, key=lambda f: (f.tier != "close", f.user.name))

    def _recent_hangouts(self, user_id: str, others: Collection[str]) -> Counter[str]:
        partners = self.repo.hangout_partners(user_id, self._clock.now() - TIER_WINDOW)
        return Counter(uid for uid in partners if uid in others)

    # --- blocks ("Hidden from") -------------------------------------------

    def blocked(self, user_id: str) -> list[User]:
        return self.repo.blocked(user_id)

    def block(self, user_id: str, other_id: str) -> None:
        """Hide your Moves from them, and cut every tie: the friendship,
        pending requests both ways, your Circles, both auto-join lists."""
        require_users(self.repo, [other_id], not_self=user_id)
        try:
            self.repo.block(user_id, other_id)
            self.repo.drop_friendship(user_id, other_id)
            self.repo.drop_from_owned_circles(user_id, other_id)
            self.repo.drop_autojoin_pair(user_id, other_id)
            self.uow.commit()
        except Exception:
            self.uow.rollback()
            raise

    def unblock(self, user_id: str, other_id: str) -> None:
        self.repo.unblock(user_id, other_id)
        self.uow.commit()

    # --- auto-join --------------------------------------------------------

    def autojoin(self, user_id: str) -> list[User]:
        return self.repo.autojoin(user_id)

    def set_autojoin(self, user_id: str, other_ids: Iterable[str]) -> list[User]:
        others = require_users(self.repo, other_ids, not_self=user_id)
        require_friends(self.repo, user_id, [u.id for u in others])
        try:
            self.repo.replace_autojoin(user_id, [u.id for u in others])
            self.uow.commit()
        except Exception:
            self.uow.rollback()
            raise
        return self.autojoin(user_id)

    def add_autojoin(self, user_id: str, other_id: str) -> None:
        require_users(self.repo, [user_id])
        require_users(self.repo, [other_id], not_self=user_id)
        self.repo.add_autojoin(user_id, other_id)
        self.uow.commit()
