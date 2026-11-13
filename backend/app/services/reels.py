"""Reels: the feed, the place behind a Reel, and saving it (surfaces S4, plan A.7).

`place` answers "what is happening at this Reel's spot right now?": a live
Move there the viewer may see (only through `MoveGateway.list_live_visible`,
which applies the privacy rules), or a Muse draft to start one. Muse only
proposes: nothing here posts a Move.

Privacy: the viewer's lat/lng is rounded with `app.core.areas.coarse`, used
for one distance and one Muse hint, and never stored.
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass

from sqlmodel import Session, col, or_, select

from app.container import Container
from app.core.areas import coarse
from app.domain.errors import NotFound
from app.ports import MoveDraftOut, MoveSnapshot, ParticipantStatus
from app.tables import Friendship, Mark, Reel, SavedMark, SavedReel, User

logger = logging.getLogger(__name__)

# Muse calls on the place sheet must not hold it open (plan R.10).
PLACE_DRAFT_TIMEOUT_S = 8.0
PLACE_RESOLVE_TIMEOUT_S = 8.0
CONFIRM_BELOW = 0.6
KM_PER_MILE = 1.609344
ACTIVE = ("going", "there")

type LatLng = tuple[float, float]


class ReelNotFound(NotFound):
    def __init__(self, reel_id: str) -> None:
        super().__init__(f"reel {reel_id} not found")
        self.reel_id = reel_id


@dataclass(frozen=True)
class ReelView:
    reel: Reel
    mark: Mark | None
    distance_mi: float | None
    saved: bool


@dataclass(frozen=True)
class ActiveMoveView:
    move: MoveSnapshot
    creator: User
    participants_count: int
    friends_there: tuple[User, ...]
    my_status: ParticipantStatus | None


@dataclass(frozen=True)
class PlaceView:
    reel_id: str
    mark: Mark | None
    distance_mi: float | None
    active_move: ActiveMoveView | None
    headline: str
    draft: MoveDraftOut | None
    confirm_place: bool


def coarse_point(lat: float | None, lng: float | None) -> LatLng | None:
    if lat is None or lng is None:
        return None
    return (coarse(lat), coarse(lng))


def miles_between(a: LatLng, b: LatLng) -> float:
    """Great-circle distance in miles, rounded to 0.1."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    km = 2 * 6371.0 * math.asin(math.sqrt(h))
    return round(km / KM_PER_MILE, 1)


def distance_to(mark: Mark | None, at: LatLng | None) -> float | None:
    if mark is None or at is None:
        return None
    return miles_between(at, (mark.lat, mark.lng))


def mark_id_of(reel: Reel) -> str | None:
    return reel.resolved_mark_id or reel.geotag_mark_id


def active_count(move: MoveSnapshot) -> int:
    return sum(1 for p in move.participants if p.status in ACTIVE)


def headline_for(active: ActiveMoveView | None, viewer_id: str) -> str:
    if active is None:
        return "Start a Move here"
    is_me = active.creator.id == viewer_id
    who = "You" if is_me else active.creator.first_name
    others = [u for u in active.friends_there if u.id != active.creator.id]
    if not others:
        return f"{who} {'are' if is_me else 'is'} here rn"
    noun = "friend" if len(others) == 1 else "friends"
    return f"{who} + {len(others)} {noun} are here rn"


class ReelService:
    def __init__(self, session: Session, container: Container) -> None:
        self.session = session
        self.c = container

    # --- Feed ----------------------------------------------------------------

    def feed(self, viewer_id: str, at: LatLng | None) -> list[ReelView]:
        reels = list(self.session.exec(select(Reel).order_by(col(Reel.id))))
        marks = self._marks({m for r in reels if (m := mark_id_of(r))})
        saved = self._saved_reel_ids(viewer_id)
        return [
            ReelView(
                reel=r,
                mark=(mark := marks.get(mark_id_of(r) or "")),
                distance_mi=distance_to(mark, at),
                saved=r.id in saved,
            )
            for r in reels
        ]

    # --- Place sheet ---------------------------------------------------------

    async def place(self, viewer_id: str, reel_id: str, at: LatLng | None) -> PlaceView:
        reel = self._require(reel_id)
        mark_id, confirm = mark_id_of(reel), False
        if mark_id is None:
            mark_id, confirm = await self._resolve(viewer_id, reel, at)
        mark = self.session.get(Mark, mark_id) if mark_id else None
        active = self._active_move(viewer_id, mark.id) if mark else None
        draft = await self._draft(viewer_id, mark.id if mark else None, reel, at)
        return PlaceView(
            reel_id=reel.id,
            mark=mark,
            distance_mi=distance_to(mark, at),
            active_move=active,
            headline=headline_for(active, viewer_id),
            draft=draft,
            confirm_place=confirm,
        )

    async def _resolve(
        self, viewer_id: str, reel: Reel, at: LatLng | None
    ) -> tuple[str | None, bool]:
        """Ask Muse once which Mark a Reel shows; persist a confident-enough hit."""
        try:
            res = await asyncio.wait_for(
                self.c.muse.resolve_place(viewer_id, caption=reel.caption, coarse=at),
                PLACE_RESOLVE_TIMEOUT_S,
            )
        except Exception:
            logger.warning("resolve_place failed for reel %s", reel.id, exc_info=True)
            return None, False
        if not res.mark_id or self.session.get(Mark, res.mark_id) is None:
            return None, False
        reel.resolved_mark_id = res.mark_id
        self.session.add(reel)
        self.session.commit()
        return res.mark_id, res.confidence < CONFIRM_BELOW

    async def _draft(
        self, viewer_id: str, mark_id: str | None, reel: Reel, at: LatLng | None
    ) -> MoveDraftOut | None:
        """A composer prefill, or None when Muse is slow or broken."""
        try:
            return await asyncio.wait_for(
                self.c.muse.compose_move(
                    viewer_id, mark_id=mark_id, seed_text=reel.caption, coarse=at
                ),
                PLACE_DRAFT_TIMEOUT_S,
            )
        except Exception:
            logger.warning("compose_move failed for reel %s", reel.id, exc_info=True)
            return None

    def _active_move(self, viewer_id: str, mark_id: str) -> ActiveMoveView | None:
        here = [
            m for m in self.c.moves.list_live_visible(viewer_id) if m.mark.id == mark_id
        ]
        if not here:
            return None
        move = sorted(here, key=lambda m: (-active_count(m), m.id))[0]
        creator = self.session.get(User, move.creator_id)
        if creator is None:
            return None
        return ActiveMoveView(
            move=move,
            creator=creator,
            participants_count=active_count(move),
            friends_there=self._friends_there(viewer_id, move),
            my_status=next(
                (p.status for p in move.participants if p.user_id == viewer_id), None
            ),
        )

    def _friends_there(self, viewer_id: str, move: MoveSnapshot) -> tuple[User, ...]:
        friends = self._friend_ids(viewer_id)
        ids = [
            p.user_id
            for p in move.participants
            if p.status in ACTIVE and p.user_id in friends
        ]
        users = (self.session.get(User, i) for i in ids)
        return tuple(u for u in users if u is not None)

    # --- Save ----------------------------------------------------------------

    def save(self, viewer_id: str, reel_id: str) -> None:
        """Idempotent. Also saves the Reel's Mark as a Saved Mark from this Reel."""
        reel = self._require(reel_id)
        if self.session.get(SavedReel, (viewer_id, reel.id)) is None:
            self.session.add(
                SavedReel(
                    user_id=viewer_id, reel_id=reel.id, saved_at=self.c.clock.now()
                )
            )
            self.session.commit()
        if mark_id := mark_id_of(reel):
            self.c.marks.save(viewer_id, mark_id, "reel", reel.id)

    def unsave(self, viewer_id: str, reel_id: str) -> None:
        """Idempotent. Removes the Saved Mark too when this Reel saved it."""
        reel = self._require(reel_id)
        row = self.session.get(SavedReel, (viewer_id, reel.id))
        if row is not None:
            self.session.delete(row)
            self.session.commit()
        mark_id = mark_id_of(reel)
        if mark_id and self._saved_from_reel(viewer_id, mark_id, reel.id):
            self.c.marks.unsave(viewer_id, mark_id)

    # --- Reads ---------------------------------------------------------------

    def _require(self, reel_id: str) -> Reel:
        reel = self.session.get(Reel, reel_id)
        if reel is None:
            raise ReelNotFound(reel_id)
        return reel

    def _marks(self, ids: set[str]) -> dict[str, Mark]:
        if not ids:
            return {}
        rows = self.session.exec(select(Mark).where(col(Mark.id).in_(ids)))
        return {m.id: m for m in rows}

    def _saved_reel_ids(self, viewer_id: str) -> set[str]:
        rows = self.session.exec(
            select(SavedReel.reel_id).where(SavedReel.user_id == viewer_id)
        )
        return set(rows)

    def _saved_from_reel(self, viewer_id: str, mark_id: str, reel_id: str) -> bool:
        row = self.session.exec(
            select(SavedMark).where(
                SavedMark.user_id == viewer_id, SavedMark.mark_id == mark_id
            )
        ).first()
        return row is not None and row.source == "reel" and row.source_ref == reel_id

    def _friend_ids(self, user_id: str) -> frozenset[str]:
        rows = self.session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
            )
        )
        return frozenset(r.user_b if r.user_a == user_id else r.user_a for r in rows)
