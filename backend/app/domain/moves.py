"""The Move lifecycle as pure rules (ARCHITECTURE.md 5.3, 7.3).

Every function takes the current `MoveSnapshot` and the time, and returns the
new state, or raises an error from `app.domain.errors`. Nothing here reads the
clock, touches storage or checks visibility: the service (C4) loads the
snapshot, checks `can_see`, calls a rule here, and writes what it returns
through the repository. Imports only the standard library and the stdlib-only
contract vocabulary in `app.ports`.

Participant state machine (7.3)::

    (none) --join via tap / open_ble--> going --arrive--> there --leave--> left
    (none) --join via ble_prompt / ble_auto / open_ble--------> there
                                        going --leave------------------> (none)
                         going / there --leave quietly-----------> (none)

* Taking back a Pull up (`going`) and leaving quietly delete the participant
  (`withdraw`): no ghost, and the user may Pull up again. Only leaving while
  `there` (not quietly) makes a ghost. The creator always becomes `left`.
* Joining again is idempotent and never downgrades: `join(going)` while
  `there` is a no-op; `join(there)` while `going` is an arrival.
* `left` is terminal for that Move (the user is a ghost now); rejoining raises.
* `arrive` while `there` and `leave` while `left` are no-ops.
* Every change needs a `live` Move.

Rules that report "no change" return None, so the caller knows not to write
or publish anything.

A Move ends (`end`) when:

* `creator`: the creator ends it by hand,
* `everyone_left`: every participant has left,
* `stale`: nothing happened for `STALE_AFTER` (see `is_stale`),
* `nobody_bit`: the creator accepted a "nobody bit" suggestion while nobody
  had joined (10.9). This one is recorded as `cancelled`; the rest as `ended`.
"""

from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from app.domain.errors import (
    EndNotAllowed,
    IllegalTransition,
    InvalidMove,
    MoveNotLive,
    MoveNotOpen,
    NotMoveCreator,
    NotParticipant,
    UnverifiedOpenMove,
)
from app.ports import (
    Category,
    EndReason,
    JoinedVia,
    MoveCreate,
    MoveKind,
    MoveOrigin,
    MoveSnapshot,
    MoveStatus,
    ParticipantSnapshot,
    ParticipantStatus,
)

STALE_AFTER = timedelta(hours=3)
"""A live Move with no activity for this long is ended by the scheduler (7.3)."""

MAX_TEXT_LENGTH = 280
FILL_MINUTES = range(5, 11)
"""Allowed fill windows in minutes: a flare's "5 to 10 min" (1.4, 7.2)."""

JOIN_STATUSES: dict[JoinedVia, frozenset[ParticipantStatus]] = {
    "creator": frozenset({"going", "there"}),
    "tap": frozenset({"going"}),
    "ble_prompt": frozenset({"there"}),
    "ble_auto": frozenset({"there"}),
    "open_ble": frozenset({"going", "there"}),
}
"""The status each way of joining may start at. BLE joins mean the user is
physically co-present, so they start `there`."""

END_STATUS: dict[EndReason, MoveStatus] = {
    "creator": "ended",
    "everyone_left": "ended",
    "stale": "ended",
    "nobody_bit": "cancelled",
}


@dataclass(frozen=True, slots=True)
class NewMove:
    """A validated Move ready for `MoveRepository.create`. The id is assigned
    by storage; the audience is resolved separately by `domain.privacy`."""

    creator_id: str
    mark_id: str
    text: str
    category: Category
    kind: MoveKind
    open: bool
    origin: MoveOrigin
    origin_ref: str | None
    starts_at: datetime
    fill_deadline: datetime | None
    notify_user_ids: tuple[str, ...] | None
    creator: ParticipantSnapshot


# --- Creating ----------------------------------------------------------------


def validate_text(text: str) -> str:
    """The stripped Move text, or `InvalidMove` if blank or too long."""
    normalized = text.strip()
    if not normalized:
        raise InvalidMove("move text must not be blank")
    if len(normalized) > MAX_TEXT_LENGTH:
        raise InvalidMove(f"move text must be at most {MAX_TEXT_LENGTH} characters")
    return normalized


def fill_deadline(now: datetime, fill_minutes: int | None) -> datetime | None:
    """`now + fill_minutes`, None when there is no fill window."""
    if fill_minutes is None:
        return None
    if fill_minutes not in FILL_MINUTES:
        raise InvalidMove(
            f"fill window must be {FILL_MINUTES.start} to "
            f"{FILL_MINUTES.stop - 1} minutes"
        )
    return now + timedelta(minutes=fill_minutes)


def require_may_post(draft: MoveCreate, *, creator_verified: bool) -> None:
    """Only verified users may post an open Move (12.3); `UnverifiedOpenMove`
    otherwise. Any user may post a Move to their own Circles and picks."""
    if draft.open and not creator_verified:
        raise UnverifiedOpenMove()


def plan_move(creator_id: str, draft: MoveCreate, now: datetime) -> NewMove:
    """Validate a draft and build the Move it creates, starting `now`.

    The creator joins as `there` when `draft.creator_there`, else `going`
    (7.2). A flare must have a fill window.
    """
    if draft.kind == "flare" and draft.fill_minutes is None:
        raise InvalidMove("a flare needs a fill window")
    status: ParticipantStatus = "there" if draft.creator_there else "going"
    return NewMove(
        creator_id=creator_id,
        mark_id=draft.mark_id,
        text=validate_text(draft.text),
        category=draft.category,
        kind=draft.kind,
        open=draft.open,
        origin=draft.origin,
        origin_ref=draft.origin_ref,
        starts_at=now,
        fill_deadline=fill_deadline(now, draft.fill_minutes),
        notify_user_ids=draft.notify_user_ids,
        creator=ParticipantSnapshot(
            user_id=creator_id,
            status=status,
            joined_via="creator",
            joined_at=now,
            arrived_at=now if status == "there" else None,
        ),
    )


# --- Participants --------------------------------------------------------------


def participant(move: MoveSnapshot, user_id: str) -> ParticipantSnapshot | None:
    return next((p for p in move.participants if p.user_id == user_id), None)


def join(
    move: MoveSnapshot,
    user_id: str,
    status: ParticipantStatus,
    joined_via: JoinedVia,
    now: datetime,
) -> ParticipantSnapshot | None:
    """Pull up (`going`) or join on the spot (`there`).

    Returns the participant to store, or None when nothing changes (already
    joined at this status or further). Raises `IllegalTransition` for a
    `status`/`joined_via` pair outside `JOIN_STATUSES`, a `creator` join by
    someone else, `left` as a target, or a rejoin after leaving;
    `MoveNotOpen` for `open_ble` on a closed Move; `MoveNotLive`.

    Visibility (`can_see`) is the caller's job. An `open_ble` join is the one
    that also widens the audience; the caller writes that too.
    """
    _require_live(move)
    if status not in JOIN_STATUSES[joined_via] or (
        joined_via == "creator" and user_id != move.creator_id
    ):
        raise IllegalTransition(None, f"{status} via {joined_via}")
    if joined_via == "open_ble" and not move.open:
        raise MoveNotOpen(move.id)
    current = participant(move, user_id)
    if current is None:
        return ParticipantSnapshot(
            user_id=user_id,
            status=status,
            joined_via=joined_via,
            joined_at=now,
            arrived_at=now if status == "there" else None,
        )
    if current.status == "left":
        raise IllegalTransition("left", status)
    if current.status == "going" and status == "there":
        return replace(current, status="there", arrived_at=now)
    return None


def arrive(
    move: MoveSnapshot, user_id: str, now: datetime
) -> ParticipantSnapshot | None:
    """`going` -> `there`; None if already `there`. Raises `NotParticipant`,
    `IllegalTransition` after leaving, `MoveNotLive`."""
    current = _require_participant(move, user_id)
    if current.status == "there":
        return None
    if current.status == "left":
        raise IllegalTransition("left", "there")
    return replace(current, status="there", arrived_at=now)


def leave(
    move: MoveSnapshot, user_id: str, now: datetime
) -> ParticipantSnapshot | None:
    """`going` or `there` -> `left`; None if already `left`. Raises
    `NotParticipant`, `MoveNotLive`. Afterwards check `everyone_left`."""
    current = _require_participant(move, user_id)
    if current.status == "left":
        return None
    return replace(current, status="left", left_at=now)


def withdraw(move: MoveSnapshot, user_id: str) -> ParticipantSnapshot:
    """Take a participant out of the Move entirely: the row is deleted, so no
    ghost is left and the user may Pull up again later. Used to take back a
    Pull up (`going`) and to leave quietly (any status). Returns the removed
    participant. Raises `NotParticipant`, `MoveNotLive`."""
    return _require_participant(move, user_id)


def removes_row(
    move: MoveSnapshot, current: ParticipantSnapshot, *, quiet: bool
) -> bool:
    """True when leaving deletes the participant row (`withdraw`) instead of
    becoming `left` (a ghost): a quiet leave, or taking back a Pull up while
    still `going`. The creator always keeps today's `left` behaviour."""
    if current.user_id == move.creator_id or current.status == "left":
        return False
    return quiet or current.status == "going"


def without_participant(move: MoveSnapshot, user_id: str) -> MoveSnapshot:
    """`move` with `user_id`'s entry removed (after `withdraw`)."""
    kept = tuple(p for p in move.participants if p.user_id != user_id)
    return replace(move, participants=kept)


def with_participant(move: MoveSnapshot, updated: ParticipantSnapshot) -> MoveSnapshot:
    """`move` with `updated` inserted or replacing the same user's entry, so
    rules can be chained (for example `leave` then `everyone_left`)."""
    others = tuple(p for p in move.participants if p.user_id != updated.user_id)
    return replace(move, participants=(*others, updated))


def everyone_left(move: MoveSnapshot) -> bool:
    """True when the Move has participants and all of them have left."""
    return bool(move.participants) and all(
        p.status == "left" for p in move.participants
    )


def has_joiners(move: MoveSnapshot) -> bool:
    """True when anyone besides the creator has joined (even if they left)."""
    return any(p.user_id != move.creator_id for p in move.participants)


# --- Ending ------------------------------------------------------------------


def last_activity(move: MoveSnapshot) -> datetime:
    """The latest of `starts_at` and every participant join, arrival and leave."""
    stamps = [move.starts_at]
    for p in move.participants:
        stamps.extend(t for t in (p.joined_at, p.arrived_at, p.left_at) if t)
    return max(stamps)


def stale_cutoff(now: datetime) -> datetime:
    """Live Moves that started at or before this may be stale; use it to
    narrow the candidates in SQL, then confirm each with `is_stale`."""
    return now - STALE_AFTER


def is_stale(move: MoveSnapshot, now: datetime) -> bool:
    """True when the Move is live and `last_activity` is at least
    `STALE_AFTER` before `now` (exactly 3h counts as stale)."""
    return move.status == "live" and now - last_activity(move) >= STALE_AFTER


def end(
    move: MoveSnapshot,
    reason: EndReason,
    now: datetime,
    *,
    actor_id: str | None = None,
) -> MoveSnapshot:
    """The ended Move: status from `END_STATUS`, `ends_at=now`.

    Guards per reason: `creator` needs `actor_id == creator_id`
    (`NotMoveCreator`); `everyone_left`, `stale` and `nobody_bit` need
    `everyone_left`, `is_stale` and `not has_joiners` respectively
    (`EndNotAllowed`). Always raises `MoveNotLive` on an ended Move.
    """
    _require_live(move)
    if reason == "creator" and actor_id != move.creator_id:
        raise NotMoveCreator(move.id)
    holds = {
        "creator": True,
        "everyone_left": everyone_left(move),
        "stale": is_stale(move, now),
        "nobody_bit": not has_joiners(move),
    }[reason]
    if not holds:
        raise EndNotAllowed(move.id, reason)
    return replace(move, status=END_STATUS[reason], ends_at=now)


# --- Guards --------------------------------------------------------------------


def _require_live(move: MoveSnapshot) -> None:
    if move.status != "live":
        raise MoveNotLive(move.id, move.status)


def _require_participant(move: MoveSnapshot, user_id: str) -> ParticipantSnapshot:
    _require_live(move)
    current = participant(move, user_id)
    if current is None:
        raise NotParticipant(move.id, user_id)
    return current
