"""The Moves tools Muse (Meta AI) calls over MCP, as plain async methods.

Thin wrappers over the glasses service and the existing ports. The MCP layer in
`app/mcp_server.py` only adds transport, auth and the tool descriptions.

Rules the tools keep (ARCHITECTURE.md 1.5):
  * Muse proposes, the user disposes: `draft_move` writes nothing; only
    `confirm_move` posts, and its description tells the caller to ask first.
  * Recipients are the caller's friends only. A name that matches several
    friends, or only non-friends, never guesses: it comes back as a question.
  * Coordinates are used for one nearest-Mark lookup and are never stored or
    echoed. `friends_nearby` names a place and opted-in friends, never a position.
  * Writes take a `request_id` and are idempotent, so a retried call after a
    timeout cannot post twice. Every tool is bounded well under the caller's
    45 s timeout.

Tools return plain dicts with a `status` key instead of raising, so the model
reads the reason and decides what to ask the user.
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from typing import Any, Protocol

from app.container import Container
from app.ports import MarkSnapshot, MoveSnapshot
from app.services import glasses
from app.services.glasses import DraftExpired, GlassesService

logger = logging.getLogger(__name__)

TOOL_TIMEOUT_S = 8.0  # the caller gives up at 45 s and never retries
IDEMPOTENCY_KEEP = 512
MAX_RECIPIENTS = 8
MAX_NAME = 80

type Result = dict[str, Any]


@dataclass(frozen=True, slots=True)
class Person:
    id: str
    name: str
    first_name: str
    username: str | None
    is_friend: bool


class PeopleDirectory(Protocol):
    """People lookups for one caller. Implemented over core tables by
    `repositories.mcp_people.SqlPeopleDirectory`; read-only."""

    def search(self, me: str, query: str) -> list[Person]:
        """People matching a name or @username, blocked users hidden."""

    def names(self, user_ids: Iterable[str]) -> dict[str, str]:
        """Display name for each id."""

    def opted_in_friends(self, me: str, user_ids: Iterable[str]) -> list[Person]:
        """Those of `user_ids` who are `me`'s friends and have BLE opt-in on."""


class IdempotencyCache:
    """Remembers the result of a write per (user, tool, request_id). In memory,
    bounded, oldest evicted first; a restart forgets it, which is why each write
    is also idempotent on its own state (the draft, the participant row)."""

    def __init__(self, keep: int = IDEMPOTENCY_KEEP) -> None:
        self._keep = keep
        self._items: OrderedDict[tuple[str, str, str], Result] = OrderedDict()

    def get(self, key: tuple[str, str, str]) -> Result | None:
        found = self._items.get(key)
        return None if found is None else dict(found)

    def put(self, key: tuple[str, str, str], result: Result) -> None:
        self._items[key] = dict(result)
        self._items.move_to_end(key)
        while len(self._items) > self._keep:
            self._items.popitem(last=False)


def _clean_name(raw: str) -> str:
    return " ".join(raw.split())[:MAX_NAME]


def _pick(query: str, friends: list[Person]) -> list[Person]:
    """Narrow several friend matches by an exact name, first name or @handle."""
    q = query.lower().lstrip("@")
    exact = [
        p
        for p in friends
        if q in {p.name.lower(), p.first_name.lower(), (p.username or "").lower()}
    ]
    return exact or friends


class MovesTools:
    def __init__(
        self,
        *,
        container: Container,
        user_id: str,
        people: PeopleDirectory,
        glasses_service: GlassesService,
        place_by_name: Callable[[str], MarkSnapshot | None],
        idempotency: IdempotencyCache,
    ) -> None:
        self.c = container
        self.me = user_id
        self.people = people
        self.glasses = glasses_service
        self.place_by_name = place_by_name
        self.done = idempotency

    # -- recipients ---------------------------------------------------------

    def resolve_friends(self, names: list[str]) -> tuple[list[Person], list[Result]]:
        """Friends for each name, plus a question per name that did not resolve."""
        found: dict[str, Person] = {}
        problems: list[Result] = []
        for raw in names[:MAX_RECIPIENTS]:
            query = _clean_name(raw)
            if not query:
                continue
            matches = self.people.search(self.me, query)
            friends = [p for p in matches if p.is_friend and p.id != self.me]
            if not friends and matches:
                problems.append(
                    {
                        "name": query,
                        "problem": "not_a_friend",
                        "message": f"{query} isn't one of your friends on Moves, so "
                        "you can't send them a Move.",
                    }
                )
                continue
            if not friends:
                problems.append(
                    {
                        "name": query,
                        "problem": "not_found",
                        "message": f"No one named {query} found.",
                    }
                )
                continue
            pool = _pick(query, friends)
            if len(pool) > 1:
                problems.append(
                    {
                        "name": query,
                        "problem": "ambiguous",
                        "message": f"Which {query}? Ask the user, then call again "
                        "with the full name or @username.",
                        "candidates": [
                            {"name": p.name, "username": p.username} for p in pool
                        ],
                    }
                )
                continue
            found[pool[0].id] = pool[0]
        if len(names) > MAX_RECIPIENTS:
            problems.append(
                {"problem": "too_many", "message": f"At most {MAX_RECIPIENTS} people."}
            )
        return list(found.values()), problems

    # -- tools ----------------------------------------------------------------

    async def draft_move(
        self,
        text: str,
        to: list[str] | None = None,
        place: str | None = None,
        lat: float | None = None,
        lng: float | None = None,
    ) -> Result:
        """Prepare a Move for the user to approve. Writes nothing."""
        said = " ".join(text.split())
        if not said:
            return {"status": "invalid", "message": "Say what the Move is."}
        # Muse runs in Meta's cloud, so any coordinates it sends are not the
        # user's. The place comes from names, history or the demo Mark only.
        del lat, lng
        recipients, problems = self.resolve_friends(to or [])
        if problems:
            return {"status": "needs_clarification", "problems": problems}
        # Only a venue the user named counts. A city or neighborhood Muse made up
        # matches no Mark and is ignored: the place then comes from the phone's
        # location, the usual Mark or the demo Mark.
        mark = self.place_by_name(place) if place and place.strip() else None
        result = await self.glasses.draft_from_text(
            self.me,
            said,
            place=mark,
            user_ids=tuple(p.id for p in recipients),
            trust_muse=False,
        )
        if result.needs_place or result.draft_id is None:
            return {
                "status": "needs_place",
                "question": "Where at?",
                "spoken": result.spoken,
            }
        return {
            "status": "draft",
            "draft_id": result.draft_id,
            "place": result.place,
            "text": result.text,
            "recipients": self._recipient_names(result, recipients),
            "nudges": self._nudges(result, recipients),
            "spoken": result.spoken,
            "expires_at": result.expires_at.isoformat() if result.expires_at else None,
            "next": "Read this to the user. Call confirm_move only after they say yes.",
        }

    def _recipient_names(
        self, result: glasses.CommandResult, chosen: list[Person]
    ) -> list[str]:
        if chosen:
            return [p.name for p in chosen]
        draft = result.draft
        ids = draft.user_ids if draft else ()
        return list(self.people.names(ids).values())

    def _nudges(
        self, result: glasses.CommandResult, chosen: list[Person]
    ) -> list[Result]:
        draft = result.draft
        if draft is None:
            return []
        picks = [
            n for n in draft.notify if not chosen or n.user_id in {p.id for p in chosen}
        ]
        names = self.people.names(n.user_id for n in picks)
        return [
            {"name": names.get(n.user_id, "a friend"), "line": n.copy} for n in picks
        ]

    async def confirm_move(self, draft_id: str, request_id: str) -> Result:
        """Post the drafted Move. Idempotent per request_id and per draft."""
        key = (self.me, "confirm_move", request_id)
        if (cached := self.done.get(key)) is not None:
            return cached
        try:
            posted = await self.glasses.confirm(self.me, draft_id)
        except DraftExpired:
            return {
                "status": "expired",
                "message": "That draft expired or was never made. Call draft_move "
                "again and re-confirm with the user.",
            }
        result: Result = {
            "status": "posted",
            "move_id": posted.move_id,
            "text": posted.text,
            "spoken": posted.spoken,
        }
        self.done.put(key, result)
        return result

    async def share_move(self, move_id: str, to: list[str], request_id: str) -> Result:
        """Nudge friends who can already see a live Move. Idempotent."""
        key = (self.me, "share_move", request_id)
        if (cached := self.done.get(key)) is not None:
            return cached
        move = self._my_live_move(move_id)
        if isinstance(move, dict):
            return move
        recipients, problems = self.resolve_friends(to)
        if problems:
            return {"status": "needs_clarification", "problems": problems}
        if not recipients:
            return {"status": "invalid", "message": "Say who to share it with."}
        audience = self.c.moves.audience_ids(move_id)
        inside = {p.id for p in recipients if p.id in audience}
        outside = [p for p in recipients if p.id not in audience]
        nudged: set[str] = set()
        if inside:
            picks = await self.c.muse.notify_move(
                move_id, force_ids=inside, drop_ids=audience - inside
            )
            nudged = {pick.user_id for pick in picks}
        result: Result = {
            "status": "shared" if inside else "nobody_can_see_it",
            "move_id": move_id,
            "nudged": [p.name for p in recipients if p.id in nudged],
            "already_notified": [
                p.name for p in recipients if p.id in inside and p.id not in nudged
            ],
            "skipped": [
                {
                    "name": p.name,
                    "reason": "not in this Move's audience; a Move's audience is "
                    "fixed when it is posted",
                }
                for p in outside
            ],
        }
        self.done.put(key, result)
        return result

    async def pull_up(self, move_id: str, request_id: str) -> Result:
        """The user says they're coming to a Move they can see. Idempotent."""
        key = (self.me, "pull_up", request_id)
        if (cached := self.done.get(key)) is not None:
            return cached
        move = self.c.moves.get(move_id)
        if move is None or move.status != "live" or not self._can_see(move):
            return {
                "status": "not_available",
                "message": "That Move isn't live or isn't visible to the user.",
            }
        mine = next((p for p in move.participants if p.user_id == self.me), None)
        if mine is not None and mine.status in ("going", "there"):
            result: Result = self._pulled(move, "already_going")
        elif mine is not None:
            return {
                "status": "left",
                "message": "The user already left this Move; ask them in the app.",
            }
        else:
            try:
                await self.c.moves.add_participant(move_id, self.me, "going", "tap")
            except Exception:
                logger.warning("mcp pull_up failed for move %s", move_id)
                return {
                    "status": "failed",
                    "message": "Couldn't pull up. Check get_my_active_move before "
                    "retrying.",
                }
            result = self._pulled(move, "going")
        self.done.put(key, result)
        return result

    def friends_nearby(self) -> Result:
        """Opted-in friends who are with the user right now, as a group and a
        place. Never a position."""
        together = self.c.proximity.copresent_cluster(self.me)
        friends = self.people.opted_in_friends(self.me, together)
        place = self._shared_place({p.id for p in friends})
        return {
            "status": "ok",
            "count": len(friends),
            "friends": [p.first_name for p in friends],
            "place": place,
        }

    def get_my_active_move(self) -> Result:
        """The Move the user is in right now (read-only)."""
        mine = [m for m in self.c.moves.list_live_visible(self.me) if self._in(m)]
        if not mine:
            return {"status": "ok", "active": False}
        move = max(mine, key=lambda m: m.created_at)
        going = [p for p in move.participants if p.status in ("going", "there")]
        role = "creator" if move.creator_id == self.me else self._role(move)
        return {
            "status": "ok",
            "active": True,
            "move": {
                "move_id": move.id,
                "text": move.text,
                "place": move.mark.name,
                "origin": move.origin,
                "you_are": role,
                "people_in": len(going),
            },
        }

    # -- helpers --------------------------------------------------------------

    def _can_see(self, move: MoveSnapshot) -> bool:
        return move.creator_id == self.me or self.me in self.c.moves.audience_ids(
            move.id
        )

    def _in(self, move: MoveSnapshot) -> bool:
        return move.creator_id == self.me or self._role(move) != "none"

    def _role(self, move: MoveSnapshot) -> str:
        mine = next((p for p in move.participants if p.user_id == self.me), None)
        return mine.status if mine and mine.status != "left" else "none"

    def _my_live_move(self, move_id: str) -> MoveSnapshot | Result:
        move = self.c.moves.get(move_id)
        if move is None or move.status != "live" or not self._in(move):
            return {
                "status": "not_available",
                "message": "That Move isn't live, or the user isn't part of it.",
            }
        return move

    @staticmethod
    def _pulled(move: MoveSnapshot, status: str) -> Result:
        return {
            "status": status,
            "move_id": move.id,
            "text": move.text,
            "place": move.mark.name,
        }

    def _shared_place(self, friend_ids: set[str]) -> str | None:
        if not friend_ids:
            return None
        for move in self.c.moves.list_live_visible(self.me):
            if any(p.user_id in friend_ids for p in move.participants):
                return move.mark.name
        return None


async def bounded[T](
    work: Awaitable[T], timeout_s: float = TOOL_TIMEOUT_S
) -> T | Result:
    """Run a tool under the time budget. On timeout the work is cancelled and
    the caller is told to check state before retrying a write."""
    try:
        return await asyncio.wait_for(work, timeout_s)
    except TimeoutError:
        return {
            "status": "timeout",
            "message": "That took too long. Call get_my_active_move to see whether "
            "it went through before trying again.",
        }
