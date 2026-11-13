"""People lookups for the MCP tools, over core's tables (read-only).

Reuses `FriendService.search` so blocked users stay hidden and "friend" means
exactly what it means in the app.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.ports import Clock, Notifier
from app.services.friends import FriendService
from app.services.mcp_tools import Person
from app.tables import Friendship, User, UserSettings


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


class SqlPeopleDirectory:
    def __init__(self, engine: Engine, clock: Clock, notifier: Notifier) -> None:
        self._engine = engine
        self._clock = clock
        self._notifier = notifier

    def search(self, me: str, query: str) -> list[Person]:
        with Session(self._engine) as session:
            service = FriendService(session, self._clock, self._notifier)
            return [
                Person(
                    id=p.user.id,
                    name=p.user.name,
                    first_name=p.user.first_name,
                    username=p.username,
                    is_friend=p.relation == "friend",
                )
                for p in service.search(me, query)
            ]

    def names(self, user_ids: Iterable[str]) -> dict[str, str]:
        ids = list(dict.fromkeys(user_ids))
        if not ids:
            return {}
        with Session(self._engine) as session:
            rows = session.exec(
                select(User.id, User.name).where(col(User.id).in_(ids))
            ).all()
            return {row[0]: row[1] for row in rows}

    def opted_in_friends(self, me: str, user_ids: Iterable[str]) -> list[Person]:
        ids = [u for u in dict.fromkeys(user_ids) if u != me]
        if not ids:
            return []
        with Session(self._engine) as session:
            people: list[Person] = []
            for user_id in ids:
                if session.get(Friendship, _pair(me, user_id)) is None:
                    continue
                prefs = session.get(UserSettings, user_id)
                user = session.get(User, user_id)
                if user is None or prefs is None or not prefs.ble_opt_in:
                    continue
                people.append(
                    Person(user.id, user.name, user.first_name, None, is_friend=True)
                )
            return people
