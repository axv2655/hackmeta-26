"""Compact Muse context (ARCHITECTURE.md 10.1, 10.12).

Muse never sees ids, names, coordinates, addresses or calendar titles:

- People become aliases `u1, u2, ...`, Marks `k1, ...`, Moves `m1, ...`.
- Copy that names people is written with `{u3}` placeholders; `restore()`
  swaps in first names after parsing, so names never leave the server.
- At most 25 candidates per call (`MAX_CANDIDATES`), best affinity first.

`load_candidates` reads hangouts, notifications, circles and the calendar
(read-only) and turns them into `Candidate`s with features and a score.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlmodel import Session, col, or_, select

from app.domain import affinity
from app.domain.affinity import Features, HangoutFact, Target
from app.ports import CalendarGateway
from app.tables import (
    CalendarEvent,
    Circle,
    CircleMember,
    Hangout,
    Move,
    MoveParticipant,
    Notification,
    User,
    UserSettings,
)

MAX_CANDIDATES = 25
MAX_MOVES = 15
MAX_MARKS = 10

_PLACEHOLDER = re.compile(r"\{\s*([a-z]\d+)\s*\}")


class AliasBook:
    """Stable short aliases for ids, with first names for `restore()`."""

    def __init__(self, prefix: str = "u") -> None:
        self.prefix = prefix
        self._by_id: dict[str, str] = {}
        self._by_alias: dict[str, str] = {}
        self._names: dict[str, str] = {}

    def alias(self, item_id: str, name: str | None = None) -> str:
        if item_id not in self._by_id:
            a = f"{self.prefix}{len(self._by_id) + 1}"
            self._by_id[item_id] = a
            self._by_alias[a] = item_id
        if name is not None:
            self._names[item_id] = name
        return self._by_id[item_id]

    def id_of(self, alias: str | None) -> str | None:
        if not alias:
            return None
        return self._by_alias.get(alias.strip().strip("{}").strip().lower())

    def name_of(self, item_id: str) -> str:
        return self._names.get(item_id, "")

    def __contains__(self, item_id: object) -> bool:
        return item_id in self._by_id

    def __len__(self) -> int:
        return len(self._by_id)

    def restore(self, text: str, *others: AliasBook) -> str:
        """Replace `{u3}` (and bare `u3`) with first names / names."""
        books = (self, *others)

        def name(alias: str) -> str | None:
            for book in books:
                item = book.id_of(alias)
                if item is not None:
                    return book.name_of(item) or None
            return None

        text = _PLACEHOLDER.sub(lambda m: name(m.group(1)) or m.group(0), text)
        for book in books:
            for a, item in book._by_alias.items():
                n = book.name_of(item)
                if n:
                    text = re.sub(rf"\b{re.escape(a)}\b", n, text)
        return text


@dataclass(frozen=True, slots=True)
class Candidate:
    user_id: str
    first_name: str
    verified: bool
    features: Features
    affinity: float

    @property
    def busy(self) -> bool:
        return self.features.currently == "busy"

    @property
    def stretch(self) -> bool:
        """Outside the usual crew: no hangouts in 90 days."""
        return self.features.hangouts_90d == 0


@dataclass
class People:
    """Users loaded once per call: names, verification, settings."""

    users: dict[str, User] = field(default_factory=dict)
    settings: dict[str, UserSettings] = field(default_factory=dict)

    @classmethod
    def load(cls, session: Session, ids: Iterable[str]) -> People:
        ids = list(dict.fromkeys(ids))
        if not ids:
            return cls()
        users = session.exec(select(User).where(col(User.id).in_(ids))).all()
        settings = session.exec(
            select(UserSettings).where(col(UserSettings.user_id).in_(ids))
        ).all()
        return cls({u.id: u for u in users}, {s.user_id: s for s in settings})

    def first(self, uid: str) -> str:
        user = self.users.get(uid)
        return user.first_name if user else "a friend"

    def verified(self, uid: str) -> bool:
        user = self.users.get(uid)
        return bool(user and user.fb_verified)


def hangouts_by_partner(session: Session, user_id: str) -> dict[str, list[HangoutFact]]:
    rows = session.exec(
        select(Hangout).where(
            or_(col(Hangout.user_a) == user_id, col(Hangout.user_b) == user_id)
        )
    ).all()
    out: dict[str, list[HangoutFact]] = defaultdict(list)
    for h in rows:
        other = h.user_b if h.user_a == user_id else h.user_a
        out[other].append(
            HangoutFact(
                h.move_id, h.mark_id, h.category, h.weekday, h.hour_bucket, h.at
            )
        )
    return out


def _nudge_stats(
    session: Session, user_id: str, candidate_ids: Collection[str]
) -> tuple[Counter[str], Counter[str]]:
    """Per candidate: move_nudges received for `user_id`'s Moves, and how many
    of those Moves they then joined."""
    if not candidate_ids:
        return Counter(), Counter()
    notes = session.exec(
        select(Notification).where(
            col(Notification.user_id).in_(list(candidate_ids)),
            Notification.type == "move_nudge",
        )
    ).all()
    move_ids = {n.data.get("move_id") for n in notes if n.data.get("move_id")}
    if not move_ids:
        return Counter(), Counter()
    mine = set(
        session.exec(
            select(Move.id).where(
                col(Move.id).in_(move_ids), Move.creator_id == user_id
            )
        ).all()
    )
    joined = {
        (p.move_id, p.user_id)
        for p in session.exec(
            select(MoveParticipant).where(col(MoveParticipant.move_id).in_(mine))
        ).all()
    }
    sent: Counter[str] = Counter()
    hits: Counter[str] = Counter()
    for n in notes:
        mid = n.data.get("move_id")
        if mid in mine:
            sent[n.user_id] += 1
            hits[n.user_id] += (mid, n.user_id) in joined
    return sent, hits


def _shared_circles(
    session: Session, user_id: str, candidate_ids: Collection[str]
) -> Counter[str]:
    rows = session.exec(
        select(CircleMember.user_id)
        .join(Circle, col(Circle.id) == col(CircleMember.circle_id))
        .where(Circle.owner_id == user_id, col(CircleMember.user_id).in_(candidate_ids))
    ).all()
    return Counter(rows)


def busy_now(session: Session, user_ids: Collection[str], now: datetime) -> set[str]:
    """Users with a calendar block covering `now` (titles are never read)."""
    if not user_ids:
        return set()
    rows = session.exec(
        select(CalendarEvent.user_id).where(
            col(CalendarEvent.user_id).in_(list(user_ids)),
            CalendarEvent.starts_at <= now,
            CalendarEvent.ends_at > now,
        )
    ).all()
    return set(rows)


def load_candidates(
    session: Session,
    user_id: str,
    candidate_ids: Iterable[str],
    now: datetime,
    target: Target = Target(),
    *,
    calendar: CalendarGateway | None = None,
    people: People | None = None,
) -> list[Candidate]:
    """Every candidate with features and affinity to `user_id`, best first."""
    ids = [c for c in dict.fromkeys(candidate_ids) if c != user_id]
    if not ids:
        return []
    people = people or People.load(session, [user_id, *ids])
    by_partner = hangouts_by_partner(session, user_id)
    cutoff = now - timedelta(days=90)
    counts_90d = {
        uid: sum(1 for h in facts if h.at >= cutoff)
        for uid, facts in by_partner.items()
    }
    close = affinity.close_friends(counts_90d)
    sent, hits = _nudge_stats(session, user_id, ids)
    circles = _shared_circles(session, user_id, ids)
    busy = busy_now(session, ids, now)
    me = people.users.get(user_id)
    my_area = (me.last_area or me.home_area) if me else None

    out = []
    for uid in ids:
        if calendar is not None and uid not in busy:
            currently = "free" if calendar.free_window(uid, now) else "unknown"
        else:
            currently = "busy" if uid in busy else "unknown"
        f = affinity.features(
            by_partner.get(uid, ()),
            now,
            target,
            nudges_sent=sent[uid],
            nudges_joined=hits[uid],
            shared_circles=circles[uid],
            is_close_friend=uid in close,
            currently=currently,
            distance_bucket=_distance(people, uid, my_area),
        )
        out.append(
            Candidate(
                uid, people.first(uid), people.verified(uid), f, affinity.score(f)
            )
        )
    out.sort(key=lambda c: (-c.affinity, c.user_id))
    return out


def _distance(people: People, uid: str, my_area: str | None) -> affinity.DistanceBucket:
    s = people.settings.get(uid)
    user = people.users.get(uid)
    if not (s and s.location_opt_in and user and user.last_area and my_area):
        return "unknown"
    return "walkable" if user.last_area == my_area else "short_drive"


def render_candidates(
    candidates: Sequence[Candidate],
    book: AliasBook,
    *,
    limit: int = MAX_CANDIDATES,
    first: Collection[str] = (),
) -> tuple[str, list[Candidate]]:
    """Compact rows, one per candidate. `first` ids are kept even past the
    limit (the creator's forced picks). Returns the text and who made it in."""
    forced = [c for c in candidates if c.user_id in first]
    rest = [c for c in candidates if c.user_id not in first]
    shown = (forced + rest)[: max(limit, len(forced))]
    lines = ["alias|aff|30d|90d|last|cat|slot|mark|pull|circ|close|now|dist|ver"]
    for c in shown:
        f = c.features
        lines.append(
            "|".join(
                [
                    book.alias(c.user_id, c.first_name),
                    f"{c.affinity:.1f}",
                    str(f.hangouts_30d),
                    str(f.hangouts_90d),
                    "-" if f.last_hangout_days is None else f"{f.last_hangout_days}d",
                    str(f.same_category),
                    str(f.same_slot),
                    str(f.same_mark),
                    f"{f.pull_up_rate:.2f}",
                    str(f.shared_circles),
                    "y" if f.is_close_friend else "n",
                    f.currently,
                    f.distance_bucket,
                    "y" if c.verified else "n",
                ]
            )
        )
    return "\n".join(lines), shown
