"""Sign up and log in (real accounts next to the seeded demo world).

    signup  makes a `users` row, its settings and a credential, and friends
            the new person with everyone already here, and adds them to the
            example Moves, so the app is alive the moment they log in.
            Friend requests (`services/friends.py`) cover anyone added later.
    login   checks a username and password and returns the user.

The client then sends the user's id as `X-User-Id`, like the mock login.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.core.areas import HOME_AREA
from app.domain.accounts import (
    BadLogin,
    UsernameTaken,
    check_signup,
    hash_password,
    normalize_username,
    password_matches,
)
from app.ports import Clock
from app.services.examples import join_examples
from app.tables import Credential, Friendship, User, UserSettings, new_id

COLORS = ("#1877F2", "#E4405F", "#42B72A", "#F7B928", "#A033FF", "#FF6F3C", "#00A3A3")


class AccountService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    def signup(self, name: str, username: str, password: str) -> tuple[User, str]:
        name, username = name.strip(), normalize_username(username)
        check_signup(name, username, password)
        if self._credential(username) is not None:
            raise UsernameTaken(username)
        now = self.clock.now()
        uid = f"u_{username}"
        if self.session.get(User, uid) is not None:
            uid = f"u_{new_id()}"
        user = User(
            id=uid,
            name=name,
            first_name=name.split()[0],
            avatar_color=COLORS[sum(map(ord, username)) % len(COLORS)],
            home_area=HOME_AREA,
            created_at=now,
        )
        self.session.add(user)
        self.session.add(UserSettings(user_id=uid))
        self.session.flush()
        self.session.add(
            Credential(
                user_id=uid,
                username=username,
                password_hash=hash_password(password),
                created_at=now,
            )
        )
        others = self.session.exec(select(User.id).where(User.id != uid)).all()
        for other in others:
            low, high = sorted((uid, other))
            self.session.add(Friendship(user_a=low, user_b=high, since=now))
        join_examples(self.session, uid)
        self.session.commit()
        self.session.refresh(user)
        return user, username

    def login(self, username: str, password: str) -> tuple[User, str]:
        username = normalize_username(username)
        cred = self._credential(username)
        if cred is None or not password_matches(password, cred.password_hash):
            raise BadLogin()
        user = self.session.get(User, cred.user_id)
        if user is None:
            raise BadLogin()
        return user, username

    def _credential(self, username: str) -> Credential | None:
        query = select(Credential).where(Credential.username == username)
        return self.session.exec(query).first()
