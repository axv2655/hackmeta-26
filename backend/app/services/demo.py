"""Demo Control (ARCHITECTURE.md 15.2): the buttons that stand in for time,
hardware and other people during the live demo.

Every action goes through the same ports and services the real app uses, so
a Move made here notifies, ranks and ends like any other. The reset is soft:
it never drops a table or removes an account.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Engine, delete, update
from sqlmodel import Session, col, or_, select

from app.container import Container
from app.core.clock import SystemClock
from app.core.composition import build_move_service
from app.domain.errors import MarkNotFound, NotFound
from app.hooks import Hooks
from app.ports import (
    Category,
    FreeWindow,
    MoveCreate,
    ParticipantStatus,
    SuggestionSnapshot,
)
from app.seed import ids
from app.seed.core import MOVES
from app.services import examples
from app.services.friends import FriendService, Relation
from app.services.moves import MoveService
from app.tables import (
    CalendarEvent,
    Copresence,
    FriendRequest,
    Friendship,
    SavedMark,
    Suggestion,
    User,
)

log = logging.getLogger(__name__)

DEMO_LOCATION = "demo"
LECTURE_TITLE = "CS 4349 lecture"
LECTURE_LENGTH = timedelta(minutes=75)
EXAMPLE_MOVE_IDS = frozenset(spec.id for spec in MOVES)

Scan = Callable[[str], Awaitable[SuggestionSnapshot | None]]


class NoPendingRequest(NotFound):
    def __init__(self, user_id: str) -> None:
        super().__init__(f"no pending friend request to {user_id}")
        self.user_id = user_id


class DemoUserNotFound(NotFound):
    def __init__(self, user_id: str) -> None:
        super().__init__(f"user {user_id} not found")
        self.user_id = user_id


@dataclass(frozen=True, slots=True)
class ResetResult:
    now: datetime
    refreshed_moves: int
    expired_suggestions: int
    cleared_blocks: int


@dataclass(frozen=True, slots=True)
class ScanResult:
    suggestion: SuggestionSnapshot | None
    window: FreeWindow | None


class DemoService:
    def __init__(self, session: Session, container: Container, hooks: Hooks) -> None:
        self.session = session
        self.container = container
        self.hooks = hooks

    # --- time -----------------------------------------------------------------

    def now(self) -> datetime:
        return self.container.clock.now()

    def offset_minutes(self) -> float:
        """How far demo time is from real time, in minutes: the DemoClock's own
        offset when there is one, else demo now minus the system clock."""
        offset = getattr(self.container.time_control, "offset", None)
        if not isinstance(offset, timedelta):
            offset = self.now() - SystemClock().now()
        return round(offset.total_seconds() / 60, 2)

    def set_time(
        self, *, iso: str | None, offset_minutes: float | None, reset: bool
    ) -> None:
        control = self.container.time_control
        if reset:
            control.reset()
        elif iso is not None:
            control.set_time(iso)
        elif offset_minutes is not None:
            control.shift(offset_minutes)

    def muse_status(self) -> dict[str, Any]:
        stats = _safe_stats(self.container)
        client = "http" if stats.get("client") == "HttpMuseClient" else "fake"
        live = client == "http" and not stats.get("budget_exhausted", False)
        return {"client": client, "live": live}

    # --- reset ----------------------------------------------------------------

    def reset(self) -> ResetResult:
        """Soft reset: real clock, no held Moves, fresh example Moves, no
        pending cast suggestions, no demo calendar blocks or co-presence."""
        examples.release_all()
        self.container.time_control.reset()
        expired = self._expire_cast_suggestions()
        cleared = self._delete_demo_blocks(None)
        self.session.exec(delete(Copresence))
        self.session.commit()
        refreshed = examples.ExampleMoves(
            self._engine(), self.container.clock
        ).refresh()
        return ResetResult(self.now(), refreshed, expired, cleared)

    def _expire_cast_suggestions(self) -> int:
        result = self.session.exec(
            update(Suggestion)
            .where(col(Suggestion.user_id).in_(ids.CAST))
            .where(col(Suggestion.status) == "pending")
            .values(status="expired")
        )
        return result.rowcount or 0

    def _delete_demo_blocks(
        self, user_id: str | None, after: datetime | None = None
    ) -> int:
        stmt = delete(CalendarEvent).where(col(CalendarEvent.location) == DEMO_LOCATION)
        if user_id is not None:
            stmt = stmt.where(col(CalendarEvent.user_id) == user_id)
        if after is not None:
            stmt = stmt.where(col(CalendarEvent.ends_at) > after)
        return self.session.exec(stmt).rowcount or 0

    def _delete_device_blocks(
        self, user_id: str, start: datetime, end: datetime | None = None
    ) -> int:
        """Phone busy blocks (no title, no location) overlapping the staged
        window, so a real meeting cannot hide the demo gap. The phone's next
        sync puts them back."""
        stmt = delete(CalendarEvent).where(
            col(CalendarEvent.user_id) == user_id,
            col(CalendarEvent.title).is_(None),
            col(CalendarEvent.location).is_(None),
            col(CalendarEvent.ends_at) > start,
        )
        if end is not None:
            stmt = stmt.where(col(CalendarEvent.starts_at) < end)
        return self.session.exec(stmt).rowcount or 0

    def _engine(self) -> Engine:
        bind = self.session.get_bind()
        return bind if isinstance(bind, Engine) else bind.engine

    # --- Muse scans -----------------------------------------------------------

    async def flare_scan(self, user_id: str, window_minutes: int) -> ScanResult:
        """A busy block `window_minutes` from now, a Saved Mark, then a forced
        flare scan. The window is the gap before the block."""
        self._require_user(user_id)
        now = self.now()
        self._delete_demo_blocks(user_id, after=now)
        start = now + timedelta(minutes=window_minutes)
        self._delete_device_blocks(user_id, now, start)
        self.session.add(
            CalendarEvent(
                user_id=user_id,
                title=LECTURE_TITLE,
                starts_at=start,
                ends_at=start + LECTURE_LENGTH,
                location=DEMO_LOCATION,
            )
        )
        self.session.commit()
        self._ensure_saved_mark(user_id)
        scan = self._scan("demo_flare_scan", "run_flare_scan")
        suggestion = await _run_scan(scan, user_id)
        return ScanResult(suggestion, FreeWindow(start=now, end=start))

    async def free_time(self, user_id: str) -> ScanResult:
        self._require_user(user_id)
        self._delete_demo_blocks(user_id)
        self._delete_device_blocks(user_id, self.now())
        self.session.commit()
        scan = self._scan("demo_free_time_scan", "run_free_time_scan")
        suggestion = await _run_scan(scan, user_id)
        window = self.container.calendar.free_window(user_id, self.now())
        return ScanResult(suggestion, window)

    async def revive_scan(self, user_id: str) -> SuggestionSnapshot | None:
        self._require_user(user_id)
        refresh = getattr(self.container.muse, "refresh_pseudo_groups", None)
        if refresh is not None:
            try:
                await refresh([user_id])
            except Exception:
                log.warning("pseudo-group refresh failed", exc_info=True)
        return await _run_scan(self.container.muse.run_revive_scan, user_id)

    async def nobody_bit(self, move_id: str) -> SuggestionSnapshot | None:
        return await _run_scan(self.container.muse.run_nobody_bit, move_id)

    def _scan(self, forced: str, regular: str) -> Scan | None:
        muse = self.container.muse
        return getattr(muse, forced, None) or getattr(muse, regular, None)

    def _ensure_saved_mark(self, user_id: str) -> None:
        saved = self.session.exec(
            select(SavedMark).where(col(SavedMark.user_id) == user_id).limit(1)
        ).first()
        if saved is not None:
            return
        try:
            self.container.marks.save(user_id, ids.KUMO_MATCHA, "reel", ids.REEL_KUMO)
        except MarkNotFound:
            log.info("no %s Mark to save for the flare demo", ids.KUMO_MATCHA)

    # --- other people ---------------------------------------------------------

    async def friend_move(
        self,
        caller_id: str,
        user_id: str,
        *,
        mark_id: str,
        text: str,
        category: Category | None,
        notify_me: bool,
    ) -> str:
        """A Move posted as `user_id` to their friends plus the caller."""
        self._require_user(user_id)
        mark = self.container.marks.get(mark_id)
        if mark is None:
            raise MarkNotFound(mark_id)
        audience = tuple(sorted((self._friend_ids(user_id) | {caller_id}) - {user_id}))
        draft = MoveCreate(
            mark_id=mark_id,
            text=text,
            category=category or mark.category,
            user_ids=audience,
            # Forced for the phone; posting as yourself leaves Muse to pick.
            notify_user_ids=(caller_id,)
            if notify_me and caller_id != user_id
            else None,
        )
        move = await self.container.moves.create(user_id, draft)
        return move.id

    async def friend_join(
        self, user_id: str, move_id: str, status: ParticipantStatus
    ) -> None:
        """A Pull up by tap; `there` then arrives (sets `arrived_at`), so a
        later leave leaves a ghost. A `going` friend is upgraded in place."""
        self._require_user(user_id)
        move = self.container.moves.get(move_id)
        joined = move is not None and any(
            p.user_id == user_id for p in move.participants
        )
        if not joined:
            await self.container.moves.add_participant(move_id, user_id, "going", "tap")
        if status == "there":
            await self._move_service().arrive(user_id, move_id)

    async def friend_leave(
        self, user_id: str, move_id: str, *, quiet: bool
    ) -> str | None:
        """Returns the friend's status afterwards (None when the row is gone)."""
        self._require_user(user_id)
        move = await self._move_service().leave(user_id, move_id, quiet=quiet)
        return next((p.status for p in move.participants if p.user_id == user_id), None)

    async def friend_accept(self, caller_id: str, user_id: str) -> Relation:
        friends = FriendService(
            self.session, self.container.clock, self.container.notifier
        )
        pending = self.session.get(FriendRequest, (caller_id, user_id))
        if pending is None:
            if friends.relation(user_id, caller_id) == "friend":
                return "friend"
            raise NoPendingRequest(user_id)
        return await friends.accept(user_id, caller_id)

    async def end_move(self, move_id: str) -> None:
        if move_id in EXAMPLE_MOVE_IDS:
            examples.hold(move_id)
        await self.container.moves.end(move_id, "creator")

    def _move_service(self) -> MoveService:
        return build_move_service(
            self.session, self.container.clock, self.container.events, self.hooks
        )

    def _friend_ids(self, user_id: str) -> frozenset[str]:
        rows = self.session.exec(
            select(Friendship).where(
                or_(
                    col(Friendship.user_a) == user_id,
                    col(Friendship.user_b) == user_id,
                )
            )
        ).all()
        return frozenset(r.user_b if r.user_a == user_id else r.user_a for r in rows)

    def _require_user(self, user_id: str) -> None:
        if self.session.get(User, user_id) is None:
            raise DemoUserNotFound(user_id)


async def _run_scan(scan: Scan | None, arg: str) -> SuggestionSnapshot | None:
    """A Muse scan that can never break the demo: a failure means no card."""
    if scan is None:
        return None
    try:
        return await scan(arg)
    except NotFound:
        raise
    except Exception:
        log.warning("demo scan failed", exc_info=True)
        return None


def _safe_stats(container: Container) -> dict[str, Any]:
    try:
        return dict(container.muse.muse_stats() or {})
    except Exception:
        log.warning("muse_stats failed", exc_info=True)
        return {}
