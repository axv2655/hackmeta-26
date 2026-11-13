"""Simulated proximity (ARCHITECTURE.md 8, plan A.8): the co-presence gateway,
the sweep that offers a one-tap prompt (or auto-joins), the demo writer and
the purge job.

Co-presence rows come from `/demo/copresence` (real BLE sightings are not
built). A demo row is held by giving it `last_seen = now + 2h`, so the gateway
counts a pair as together while `last_seen >= now - COPRESENCE_WINDOW`.

Privacy (8.4, product rules 2 and 5): only friends are ever paired, nothing
here returns coordinates or a "who is near me" list, and nobody joins a Move
without a tap unless they put the creator or a participant on their auto-join
list.
"""

from __future__ import annotations

import logging
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import Engine, delete, or_
from sqlmodel import Session, col, select

from app.container import Container
from app.models.users import UserLite
from app.ports import Clock, MoveSnapshot, ProximityGateway
from app.services.proximity import COPRESENCE_WINDOW, PURGE_AGE, cluster_of, pair_key
from app.tables import (
    AutojoinPref,
    Copresence,
    Friendship,
    Move,
    MoveParticipant,
    ProximitySighting,
    User,
)

logger = logging.getLogger(__name__)

DEMO_HOLD = timedelta(hours=2)


# --- Gateway -----------------------------------------------------------------


class SqlProximityGateway:
    """`ProximityGateway` over the `copresence` table; one session per call."""

    def __init__(self, engine: Engine, clock: Clock) -> None:
        self._engine = engine
        self._clock = clock

    def copresent_cluster(self, user_id: str) -> frozenset[str]:
        """Everyone connected to `user_id` through fresh pairs, minus themself."""
        return cluster_of(user_id, self._fresh_pairs()) - {user_id}

    def open_moves_near(self, user_id: str) -> list[str]:
        """Open-Move discovery needs real BLE beacons, which are not built."""
        return []

    def _fresh_pairs(self) -> list[tuple[str, str]]:
        cutoff = self._clock.now() - COPRESENCE_WINDOW
        with Session(self._engine) as session:
            rows = session.exec(
                select(Copresence).where(col(Copresence.last_seen) >= cutoff)
            ).all()
            return [(r.user_a, r.user_b) for r in rows]


# --- Sweep -------------------------------------------------------------------


@dataclass(frozen=True)
class SweepResult:
    prompted: list[str] = field(default_factory=list)
    auto_joined: list[str] = field(default_factory=list)

    def merged(self, other: SweepResult) -> SweepResult:
        return SweepResult(
            prompted=_union(self.prompted, other.prompted),
            auto_joined=_union(self.auto_joined, other.auto_joined),
        )


def _union(a: Sequence[str], b: Sequence[str]) -> list[str]:
    return list(dict.fromkeys([*a, *b]))


def join_names(names: Sequence[str]) -> str:
    """ "Anish", "Anish and Maya", "Anish, Maya and Sam"."""
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} and {names[-1]}"


class ProximitySweep:
    """Offers co-present friends a live Move: a `proximity.prompt` event, or a
    silent `ble_auto` join with an undo notification for people on an
    auto-join list."""

    def __init__(
        self,
        engine: Engine,
        container: Container,
        proximity: ProximityGateway | None = None,
    ) -> None:
        self._engine = engine
        self._c = container
        self._proximity = proximity

    @property
    def proximity(self) -> ProximityGateway:
        return self._proximity or self._c.proximity

    async def on_move_created(self, move_id: str) -> None:
        await self.sweep(move_id)

    async def sweep(self, move_id: str) -> SweepResult:
        move = self._c.moves.get(move_id)
        if move is None or move.status != "live":
            return SweepResult()
        candidates = self._candidates(move)
        if not candidates:
            return SweepResult()
        audience = self._c.moves.audience_ids(move_id)
        visible = [u for u in candidates if u in audience or move.open]
        anchors = self._anchors(move)
        # Only audience members can be added silently; an open Move's wider
        # reach is always a prompt (product rules 3 and 5).
        auto = self._autojoiners([u for u in visible if u in audience], anchors)
        people = self._people([move.creator_id, *visible, *_there_ids(move)])
        prompted: list[str] = []
        joined: list[str] = []
        for user_id in visible:
            if user_id in auto and await self._auto_join(move, user_id, people):
                joined.append(user_id)
            elif user_id not in auto:
                await self._prompt(move, user_id, people)
                prompted.append(user_id)
        return SweepResult(prompted=prompted, auto_joined=joined)

    def _candidates(self, move: MoveSnapshot) -> list[str]:
        """Co-present with the creator or anyone already there, not yet in."""
        together: set[str] = set()
        for uid in {move.creator_id, *_there_ids(move)}:
            together |= self.proximity.copresent_cluster(uid)
        inside = {p.user_id for p in move.participants} | {move.creator_id}
        return sorted(together - inside)

    @staticmethod
    def _anchors(move: MoveSnapshot) -> set[str]:
        active = {p.user_id for p in move.participants if p.status != "left"}
        return active | {move.creator_id}

    def _autojoiners(self, user_ids: Collection[str], anchors: set[str]) -> set[str]:
        if not user_ids:
            return set()
        with Session(self._engine) as session:
            rows = session.exec(
                select(AutojoinPref).where(
                    col(AutojoinPref.user_id).in_(list(user_ids)),
                    col(AutojoinPref.other_user_id).in_(list(anchors)),
                )
            ).all()
            return {r.user_id for r in rows}

    def _people(self, user_ids: Iterable[str]) -> dict[str, UserLite]:
        with Session(self._engine) as session:
            rows = session.exec(
                select(User).where(col(User.id).in_(list(set(user_ids))))
            ).all()
            return {u.id: UserLite.model_validate(u) for u in rows}

    async def _auto_join(
        self, move: MoveSnapshot, user_id: str, people: dict[str, UserLite]
    ) -> bool:
        try:
            await self._c.moves.add_participant(move.id, user_id, "there", "ble_auto")
        except Exception:
            logger.exception("auto-join of %s to move %s failed", user_id, move.id)
            return False
        creator = _first(people, move.creator_id)
        names = join_names(_with_names(move, people, exclude=user_id))
        await self._c.notifier.send(
            user_id,
            "proximity_added",
            f"Added you to {creator}'s Move",
            f"You're with {names}. Tap to undo.",
            {"move_id": move.id, "route": f"/move/{move.id}", "undo": "leave"},
        )
        return True

    async def _prompt(
        self, move: MoveSnapshot, user_id: str, people: dict[str, UserLite]
    ) -> None:
        names = _with_names(move, people, exclude=user_id)
        creator = people.get(move.creator_id)
        await self._c.events.publish(
            [user_id],
            "proximity.prompt",
            {
                "move_id": move.id,
                "mark_name": move.mark.name,
                "creator": creator.model_dump() if creator else None,
                "names": names,
                "text": f"You're with {join_names(names)}, add yourself?",
            },
        )


def _there_ids(move: MoveSnapshot) -> list[str]:
    return [p.user_id for p in move.participants if p.status == "there"]


def _first(people: dict[str, UserLite], user_id: str) -> str:
    person = people.get(user_id)
    return person.first_name if person else "a friend"


def _with_names(
    move: MoveSnapshot, people: dict[str, UserLite], *, exclude: str
) -> list[str]:
    """First names of the creator, then everyone already there."""
    ids = list(dict.fromkeys([move.creator_id, *_there_ids(move)]))
    return [_first(people, u) for u in ids if u != exclude]


# --- Demo writer -------------------------------------------------------------


def friends_of(session: Session, user_id: str) -> frozenset[str]:
    rows = session.exec(
        select(Friendship).where(
            or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
        )
    ).all()
    return frozenset(r.user_b if r.user_a == user_id else r.user_a for r in rows)


def friend_pairs(session: Session, user_ids: Sequence[str]) -> list[tuple[str, str]]:
    """Every pair among `user_ids` that are friends, as `(a, b)` with a < b."""
    ids = sorted(set(user_ids))
    rows = session.exec(
        select(Friendship).where(
            col(Friendship.user_a).in_(ids), col(Friendship.user_b).in_(ids)
        )
    ).all()
    return sorted({pair_key(r.user_a, r.user_b) for r in rows})


def set_copresence(
    session: Session, clock: Clock, user_ids: Sequence[str], on: bool
) -> int:
    """Hold (or drop) co-presence for every friend pair; returns the pair count.
    Non-friend pairs are skipped silently."""
    pairs = friend_pairs(session, user_ids)
    now = clock.now()
    for a, b in pairs:
        row = session.get(Copresence, (a, b))
        if not on:
            if row is not None:
                session.delete(row)
        elif row is None:
            session.add(
                Copresence(
                    user_a=a, user_b=b, first_seen=now, last_seen=now + DEMO_HOLD
                )
            )
        else:
            row.last_seen = now + DEMO_HOLD
            session.add(row)
    session.commit()
    return len(pairs)


def live_move_ids_for(session: Session, user_ids: Sequence[str]) -> list[str]:
    """Live Moves created by, or joined (not left) by, any of `user_ids`."""
    ids = list(set(user_ids))
    joined = select(MoveParticipant.move_id).where(
        col(MoveParticipant.user_id).in_(ids), MoveParticipant.status != "left"
    )
    rows = session.exec(
        select(Move.id)
        .where(
            Move.status == "live",
            or_(col(Move.creator_id).in_(ids), col(Move.id).in_(joined)),
        )
        .order_by(col(Move.created_at))
    ).all()
    return list(rows)


# --- Purge -------------------------------------------------------------------


def purge(engine: Engine, clock: Clock) -> int:
    """Delete raw sightings older than 2 h and stale co-presence rows."""
    now = clock.now()
    with Session(engine) as session:
        sightings = session.exec(
            delete(ProximitySighting).where(
                col(ProximitySighting.seen_at) < now - PURGE_AGE
            )
        )
        pairs = session.exec(
            delete(Copresence).where(
                col(Copresence.last_seen) < now - COPRESENCE_WINDOW
            )
        )
        session.commit()
        return (sightings.rowcount or 0) + (pairs.rowcount or 0)
