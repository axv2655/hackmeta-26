"""Sign up and log in (real accounts next to the seeded demo world).

    signup  makes a `users` row, its settings and a credential. It befriends
            nobody: a few seeded people (`WELCOME_FROM`) send the newcomer a
            friend request, so the first thing they do is accept one
            (`services/friends.py`). They also join the example Moves, so the
            app is alive the moment they log in.
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
from app.seed.ids import ANISH, PRIYA, TONY
from app.services.examples import join_examples
from app.tables import Credential, FriendRequest, User, UserSettings, new_id

# Seeded people whose friend requests greet every new account.
WELCOME_FROM = (ANISH, PRIYA, TONY)
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
        self._welcome_requests(uid)
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

    def _welcome_requests(self, uid: str) -> None:
        """Pending requests from `WELCOME_FROM` to the newcomer (skips anyone
        not in this database)."""
        now = self.clock.now()
        for sender in WELCOME_FROM:
            if sender != uid and self.session.get(User, sender) is not None:
                self.session.add(
                    FriendRequest(from_id=sender, to_id=uid, created_at=now)
                )

    def _credential(self, username: str) -> Credential | None:
        query = select(Credential).where(Credential.username == username)
        return self.session.exec(query).first()
