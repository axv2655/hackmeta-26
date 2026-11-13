"""More Demo Control (ARCHITECTURE.md 15.2): the triggers `DemoService` does
not cover. Each one still runs the real service, so the notification, push
and realtime event that follow are the same ones a real person would cause.

- an incoming friend request (`friend_request` notification)
- a friend posts a Moment that tags you (`moment_approval`)
- a route suggestion: you and a friend both heading to a far Mark (10.10)
- Muse live vs heuristic, flipped at runtime
- a scheduler job run now (auto-end, expiry, example Moves, ...)
- a test notification, to check push before going on stage
"""

from __future__ import annotations

import inspect
import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlmodel import Session, col, select

from app.container import Container
from app.core.composition import build_moment_service
from app.core.config import settings
from app.domain.errors import Conflict, MarkNotFound, NotFound
from app.hooks import Hooks
from app.muse.agents.route import walkable
from app.ports import MoveCreate, MoveSnapshot, SuggestionSnapshot
from app.scheduler.loop import Scheduler
from app.seed import ids
from app.services.demo import DemoService, DemoUserNotFound, is_deterministic
from app.services.friends import FriendService, Relation
from app.tables import FriendRequest, Friendship, Move, User

log = logging.getLogger(__name__)

MOMENT_ASSET = Path(__file__).resolve().parents[1] / "seed/assets/moments"
MOMENT_FILE = "mo_kumo_first_sip.png"
ROUTE_TEXT = "matcha run, who's in"
FALLBACK_AREA = "campus"


class NoOneToRequest(Conflict):
    def __init__(self) -> None:
        super().__init__("everyone in the demo world is already your friend")


class AlreadyFriends(Conflict):
    def __init__(self, user_id: str) -> None:
        super().__init__(f"{user_id} is already your friend")
        self.user_id = user_id


class NoLiveMove(NotFound):
    def __init__(self) -> None:
        super().__init__("you have no live Move; make one first")


class NoCompanion(Conflict):
    def __init__(self) -> None:
        super().__init__("no friend you share with the poster to ride along")


class FarAreaNeeded(Conflict):
    def __init__(self) -> None:
        super().__init__("that Mark is walkable from your area; pick another")


class UnknownJob(NotFound):
    def __init__(self, name: str) -> None:
        super().__init__(f"no scheduler job {name!r}")
        self.name = name


@dataclass(frozen=True, slots=True)
class RequestResult:
    user_id: str
    relation: Relation


@dataclass(frozen=True, slots=True)
class MomentResult:
    moment_id: str
    move_id: str


@dataclass(frozen=True, slots=True)
class RouteResult:
    move_id: str
    companion_id: str
    suggestion: SuggestionSnapshot | None


class DemoStage:
    def __init__(self, session: Session, container: Container, hooks: Hooks) -> None:
        self.session = session
        self.container = container
        self.demo = DemoService(session, container, hooks)

    # --- people ---------------------------------------------------------------

    async def friend_request(
        self, caller_id: str, user_id: str | None
    ) -> RequestResult:
        """`user_id` (else the first cast member who is not a friend yet and
        has no request either way) sends the caller a friend request."""
        sender = user_id or self._stranger(caller_id)
        self._require_user(sender)
        friends = FriendService(
            self.session, self.container.clock, self.container.notifier
        )
        if friends.relation(caller_id, sender) == "friend":
            raise AlreadyFriends(sender)
        return RequestResult(sender, await friends.request(sender, caller_id))

    async def moment(
        self, caller_id: str, user_id: str, move_id: str | None
    ) -> MomentResult:
        """`user_id` is there at the Move (joining if needed) and posts a photo
        Moment tagging the caller, who gets the approval request."""
        self._require_user(user_id)
        move_id = move_id or self._latest_live_move(caller_id)
        await self.demo.friend_join(user_id, move_id, "there")
        moments = build_moment_service(
            self.session,
            self.container.clock,
            self.container.events,
            self.container.notifier,
            Path(settings.MEDIA_DIR),
            media_url_prefix="/media",
        )
        data = (MOMENT_ASSET / MOMENT_FILE).read_bytes()
        view = await moments.upload(
            user_id,
            move_id,
            io.BytesIO(data),
            "image/png",
            caption="first sip",
            tagged_ids=(caller_id,),
        )
        return MomentResult(view.moment.id, move_id)

    async def route(
        self,
        caller_id: str,
        user_id: str,
        *,
        mark_id: str,
        companion_id: str | None,
    ) -> RouteResult:
        """`user_id` posts a Move at a far Mark; the caller and a shared friend
        both pull up from the same coarse area, so Muse's route agent offers
        the caller "go together?"."""
        self._require_user(user_id)
        mark = self.container.marks.get(mark_id)
        if mark is None:
            raise MarkNotFound(mark_id)
        area = self._far_area(caller_id, mark)
        companion = companion_id or self._companion(caller_id, user_id)
        self._require_user(companion)
        move = await self._post(user_id, caller_id, mark_id)
        self._set_area((caller_id, companion), area)
        for uid in (caller_id, companion):
            await self.container.moves.add_participant(move.id, uid, "going", "tap")
        suggestion = await self._run_route(move.id, (caller_id, companion))
        return RouteResult(move.id, companion, suggestion)

    async def _post(self, user_id: str, caller_id: str, mark_id: str) -> MoveSnapshot:
        mark = self.container.marks.get(mark_id)
        assert mark is not None
        audience = (self._friends(user_id) | {caller_id}) - {user_id}
        draft = MoveCreate(
            mark_id=mark_id,
            text=ROUTE_TEXT,
            category=mark.category,
            user_ids=tuple(sorted(audience)),
            notify_user_ids=(),
        )
        return await self.container.moves.create(user_id, draft)

    async def _run_route(
        self, move_id: str, user_ids: tuple[str, ...]
    ) -> SuggestionSnapshot | None:
        try:
            return await self.container.muse.run_route(move_id, user_ids)
        except Exception:
            log.warning("demo route failed", exc_info=True)
            return None

    def _far_area(self, caller_id: str, mark: Any) -> str:
        caller = self.session.get(User, caller_id)
        assert caller is not None
        for area in (caller.last_area, caller.home_area, FALLBACK_AREA):
            if area and not walkable(area, mark):
                return area
        raise FarAreaNeeded()

    def _set_area(self, user_ids: tuple[str, ...], area: str) -> None:
        """Coarse labels only, never coordinates (rule 2)."""
        for uid in user_ids:
            user = self.session.get(User, uid)
            if user is not None:
                user.last_area = area
                self.session.add(user)
        self.session.commit()

    def _companion(self, caller_id: str, poster_id: str) -> str:
        shared = (self._friends(caller_id) & self._friends(poster_id)) - {
            caller_id,
            poster_id,
        }
        if not shared:
            raise NoCompanion()
        return ids.DEV if ids.DEV in shared else sorted(shared)[0]

    def _stranger(self, caller_id: str) -> str:
        """Jordan first (the seeded stranger), then the rest of the cast, then
        anyone else, skipping friends, Mom and pending requests either way."""
        taken = self._friends(caller_id) | {caller_id, ids.MOM}
        taken |= self._pending(caller_id)
        existing = self.session.exec(select(User.id).order_by(col(User.id))).all()
        free = [u for u in existing if u not in taken]
        if not free:
            raise NoOneToRequest()
        ranked = (ids.JORDAN, *ids.CAST)
        return min(free, key=lambda u: ranked.index(u) if u in ranked else len(ranked))

    def _pending(self, user_id: str) -> set[str]:
        rows = self.session.exec(
            select(FriendRequest).where(
                (col(FriendRequest.from_id) == user_id)
                | (col(FriendRequest.to_id) == user_id)
            )
        ).all()
        return {r.to_id if r.from_id == user_id else r.from_id for r in rows}

    def _friends(self, user_id: str) -> set[str]:
        rows = self.session.exec(
            select(Friendship).where(
                (col(Friendship.user_a) == user_id)
                | (col(Friendship.user_b) == user_id)
            )
        ).all()
        return {r.user_b if r.user_a == user_id else r.user_a for r in rows}

    def _latest_live_move(self, user_id: str) -> str:
        row = self.session.exec(
            select(Move)
            .where(col(Move.creator_id) == user_id, col(Move.status) == "live")
            .order_by(col(Move.starts_at).desc())
            .limit(1)
        ).first()
        if row is None:
            raise NoLiveMove()
        return row.id

    def _require_user(self, user_id: str) -> None:
        if self.session.get(User, user_id) is None:
            raise DemoUserNotFound(user_id)

    # --- system ---------------------------------------------------------------

    def set_muse_live(self, live: bool) -> bool:
        """Live asks the model (when there is a key and budget); heuristic
        answers every agent from its rule-based fallback. Returns the new
        `deterministic` value."""
        runner = getattr(self.container.muse, "runner", None)
        if runner is not None and hasattr(runner, "deterministic"):
            runner.deterministic = not live
        return is_deterministic(self.container)

    async def notify_test(self, caller_id: str) -> str:
        return await self.container.notifier.send(
            caller_id,
            "move_nudge",
            "Demo Control",
            "Notifications and push reach this phone.",
            {"route": "/notifications"},
        )


def job_names(scheduler: Scheduler | None) -> list[str]:
    return sorted(j.name for j in scheduler.jobs) if scheduler else []


async def run_job(scheduler: Scheduler | None, name: str) -> Any:
    """Run one registered scheduler job now, once, outside its interval."""
    job = next(
        (j for j in (scheduler.jobs if scheduler else ()) if j.name == name), None
    )
    if job is None:
        raise UnknownJob(name)
    result = job.fn()
    if inspect.isawaitable(result):
        result = await result
    return result
