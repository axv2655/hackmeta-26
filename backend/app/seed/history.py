"""Demo history (surfaces lane, S11): eight weeks of ended Moves.

`generate_history` is the pure, Clock-relative pattern generator with
symbolic user and Mark keys. `history_moves` maps those keys to `seed/ids.py`
ids, and `seed` writes them as ended `moves` with their participants,
audiences and pairwise `hangouts` (the seed-only direct-insert exception).

Every history Move ends at least `GHOST_SAFE_GAP` (26 h) before `now`, so none
of them leaves Ghosts on the map (the Ghost window is 24 h).

Every timestamp is derived from the `now` the caller passes in, so the
patterns stay "recent" on demo day: weekdays are found by walking back whole
days from `now` (never "N days ago"), which keeps them correct on weekends.

Patterns (ARCHITECTURE.md 15.1), eight weeks back at most (hours are in
`now`'s zone; `history_moves` passes demo-local time):
  * Anish + Priya (+ Tony on alternate weeks): matcha on Tuesday afternoons,
    four distinct matcha spots in the last month.
  * Anish + Tony + Maya: Wednesday lunch every other week.
  * Anish + Maya + Dev: Thursday climbing that **stopped four weeks ago**.
  * HS friends: one Saturday hangout about six weeks ago.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations

from sqlmodel import Session

from app.domain.affinity import hour_bucket, local
from app.ports import Category, Clock
from app.seed import ids
from app.tables import Hangout, Move, MoveAudience, MoveParticipant

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, SATURDAY = 0, 1, 2, 3, 5

MATCHA_SPOTS_THIS_MONTH = ("kumo_matcha", "matcha_b", "matcha_c", "matcha_d")


@dataclass(frozen=True)
class HistoryEvent:
    """One ended Move, described with symbolic user and Mark keys."""

    users: tuple[str, ...]
    mark_key: str
    category: str
    starts_at: datetime
    ends_at: datetime


def generate_history(now: datetime) -> list[HistoryEvent]:
    """All demo history relative to `now`, oldest first. Pure and deterministic."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    events = [
        *_matcha(now),
        *_lunch(now),
        *_climbing(now),
        *_high_school(now),
    ]
    return sorted(events, key=lambda e: (e.starts_at, e.users))


def _matcha(now: datetime) -> list[HistoryEvent]:
    events = []
    for weeks_back in range(7):
        users = (
            ("anish", "priya", "tony") if weeks_back % 2 == 0 else ("anish", "priya")
        )
        spot = MATCHA_SPOTS_THIS_MONTH[weeks_back % len(MATCHA_SPOTS_THIS_MONTH)]
        events.append(_event(now, TUESDAY, weeks_back, 14, 90, users, spot, "coffee"))
    return events


def _lunch(now: datetime) -> list[HistoryEvent]:
    return [
        _event(now, WEDNESDAY, w, 12, 60, ("anish", "tony", "maya"), "chipotle", "food")
        for w in (0, 2, 4, 6)
    ]


def _climbing(now: datetime) -> list[HistoryEvent]:
    # Weeks 4..7 back: the most recent session is always at least 28 days old.
    return [
        _event(
            now,
            THURSDAY,
            w,
            18,
            90,
            ("anish", "maya", "dev"),
            "climbing_gym",
            "climbing",
        )
        for w in range(4, 8)
    ]


def _high_school(now: datetime) -> list[HistoryEvent]:
    return [
        _event(
            now, SATURDAY, 6, 15, 120, ("anish", "hs_1", "hs_2"), "hs_hangout", "food"
        )
    ]


def _event(
    now: datetime,
    weekday: int,
    weeks_back: int,
    hour: int,
    minutes: int,
    users: tuple[str, ...],
    mark_key: str,
    category: str,
) -> HistoryEvent:
    day = _latest_weekday_before(now, weekday) - timedelta(weeks=weeks_back)
    start = day.replace(hour=hour, minute=0, second=0, microsecond=0)
    return HistoryEvent(
        users=users,
        mark_key=mark_key,
        category=category,
        starts_at=start,
        ends_at=start + timedelta(minutes=minutes),
    )


def _latest_weekday_before(now: datetime, weekday: int) -> datetime:
    """The most recent `weekday` strictly before today's date, at `now`'s tz."""
    day = now - timedelta(days=1)
    while day.weekday() != weekday:
        day -= timedelta(days=1)
    return day


# --- Rows -----------------------------------------------------------------------

GHOST_SAFE_GAP = timedelta(hours=26)

USERS: dict[str, str] = {
    "anish": ids.ANISH,
    "priya": ids.PRIYA,
    "tony": ids.TONY,
    "maya": ids.MAYA,
    "dev": ids.DEV,
    "hs_1": ids.HS_SAM,
    "hs_2": ids.HS_RILEY,
}
MARKS: dict[str, str] = {
    "kumo_matcha": ids.KUMO_MATCHA,
    "matcha_b": ids.MATCHA_LEAF_WHISK,
    "matcha_c": ids.MATCHA_MAIKO,
    "matcha_d": ids.MATCHA_GREENROOM,
    "chipotle": ids.CHIPOTLE,
    "climbing_gym": ids.CLIMBING_GYM,
    "hs_hangout": ids.HS_HANGOUT,
}
# Pattern categories that are not a Move `Category`.
CATEGORY_ALIASES: dict[str, Category] = {"climbing": "fitness"}
TEXTS: dict[str, str] = {
    "kumo_matcha": "matcha at kumo after class",
    "matcha_b": "trying leaf & whisk, who's in",
    "matcha_c": "maiko matcha run",
    "matcha_d": "greenroom tea, grab a seat",
    "chipotle": "taco lunch at casa cruz",
    "climbing_gym": "climbing at summit tonight",
    "hs_hangout": "in-n-out, catching up",
}


@dataclass(frozen=True)
class HistoryMove:
    """A history event with real ids, ready to write."""

    id: str
    user_ids: tuple[str, ...]  # creator first
    mark_id: str
    category: Category
    text: str
    starts_at: datetime
    ends_at: datetime


def history_moves(now: datetime) -> list[HistoryMove]:
    """Every history Move for `now`, oldest first, with stable ids."""
    # Each event ends on a day before the anchor. Hours are demo-local time,
    # the same zone `HangoutRecorder` buckets in.
    anchor = local(now - GHOST_SAFE_GAP)
    return [
        HistoryMove(
            id=f"{ids.HISTORY_MOVE_PREFIX}{index:02d}",
            user_ids=tuple(USERS[u] for u in event.users),
            mark_id=MARKS[event.mark_key],
            category=_category(event.category),
            text=TEXTS[event.mark_key],
            starts_at=event.starts_at,
            ends_at=event.ends_at,
        )
        for index, event in enumerate(generate_history(anchor))
    ]


def _category(raw: str) -> Category:
    alias = CATEGORY_ALIASES.get(raw)
    if alias is not None:
        return alias
    return raw  # type: ignore[return-value]


def move_row(move: HistoryMove) -> Move:
    return Move(
        id=move.id,
        creator_id=move.user_ids[0],
        mark_id=move.mark_id,
        text=move.text,
        category=move.category,
        status="ended",
        starts_at=move.starts_at,
        ends_at=move.ends_at,
        created_at=move.starts_at,
    )


def participant_rows(move: HistoryMove) -> list[MoveParticipant]:
    """Everyone arrived at the start and left at the end."""
    return [
        MoveParticipant(
            move_id=move.id,
            user_id=user_id,
            status="left",
            joined_via="creator" if index == 0 else "tap",
            joined_at=move.starts_at,
            arrived_at=move.starts_at,
            left_at=move.ends_at,
        )
        for index, user_id in enumerate(move.user_ids)
    ]


def audience_rows(move: HistoryMove) -> list[MoveAudience]:
    """Everyone who went, minus the creator (an audience never holds its
    creator, as with a posted Move)."""
    return [
        MoveAudience(move_id=move.id, user_id=user_id, via="direct")
        for user_id in move.user_ids[1:]
    ]


def hangout_rows(move: HistoryMove) -> list[Hangout]:
    """One row per pair, bucketed on the end time like `HangoutRecorder`."""
    return [
        Hangout(
            user_a=a,
            user_b=b,
            move_id=move.id,
            mark_id=move.mark_id,
            category=move.category,
            weekday=local(move.ends_at).weekday(),
            hour_bucket=hour_bucket(move.ends_at),
            at=move.ends_at,
        )
        for a, b in combinations(sorted(set(move.user_ids)), 2)
    ]


def seed(session: Session, clock: Clock) -> int:
    """Write every history Move and its rows; return how many Moves."""
    moves = history_moves(clock.now())
    session.add_all(move_row(move) for move in moves)
    session.flush()  # foreign keys: Moves before their rows
    for move in moves:
        session.add_all(participant_rows(move))
        session.add_all(audience_rows(move))
        session.add_all(hangout_rows(move))
    session.flush()
    return len(moves)
