"""Notify pipeline, the `Notifier` port, second-order nudges (9.2, 9.3, 8.3).

    candidates = move_audience
               - participants
               - co-present cluster (FOMO rule: people already together are
                 swept in by proximity, never nudged)
               - users in quiet hours
               - users already nudged for this Move
               - users whose non-empty Move categories leave this one out
                 (unless the creator force-picked them)
    picked     = notify picker (Muse, or fallback)
    send       = store a notification and publish it over the socket

`on_move_created` is the only place the pipeline runs on create. When the
Move carries `notify_user_ids` (the creator's confirmed list) those users are
forced in and everyone else in the audience is forced out; Muse still writes
each line. `None` lets the picker choose.

`on_move_joined` tells the creator ("Maya is on the way.") and nudges the
joiner's close friends who are in the audience (second order). It never
widens the audience: every recipient is already in `move_audience`.

A user with an empty `move_categories` hears about every category.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from datetime import datetime
from typing import Any

from sqlmodel import Session, col, select

from app.core import timezones
from app.domain.affinity import Target, local
from app.muse.agents import notify_picker
from app.muse.agents.notify_picker import NotifyRequest
from app.muse.context import People, load_candidates
from app.muse.lane import MuseLane
from app.ports import Category, MoveSnapshot, NotificationType, NotifyPickOut
from app.tables import Block, Circle, CircleMember, Mark, Notification, UserSettings

NUDGE_TYPES: tuple[NotificationType, ...] = ("move_nudge", "friend_pulling_up")
SECOND_ORDER_MAX = 3


def in_quiet_hours(settings: UserSettings | None, now: datetime) -> bool:
    quiet = settings.quiet_hours if settings else None
    if not quiet:
        return False
    # Quiet hours are the recipient's own clock, not the poster's.
    zone = timezones.zone_for(settings.user_id) if settings else None
    start, end, hour = quiet.get("start"), quiet.get("end"), local(now, zone).hour
    if start is None or end is None or start == end:
        return False
    return start <= hour < end if start < end else hour >= start or hour < end


def notification_dict(n: Notification) -> dict[str, Any]:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "data": dict(n.data),
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat(),
    }


class MuseNotifier:
    """The `Notifier` port: store the notification, then publish it."""

    def __init__(self, lane: MuseLane) -> None:
        self.lane = lane

    async def send(
        self,
        user_id: str,
        type: NotificationType,
        title: str,
        body: str,
        data: dict[str, str],
    ) -> str:
        with self.lane.session() as session:
            row = Notification(
                user_id=user_id,
                type=type,
                title=title,
                body=body,
                data={k: str(v) for k, v in data.items()},
                created_at=self.lane.now(),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            payload = notification_dict(row)
        await self.lane.container.events.publish([user_id], "notification", payload)
        await self.lane.container.push.push([user_id], title, body, payload["data"])
        return payload["id"]


class NotifyService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane
        self.c = lane.container

    # --- hooks ----------------------------------------------------------------

    async def on_move_created(self, move_id: str) -> list[NotifyPickOut]:
        move = self.c.moves.get(move_id)
        if move is None:
            return []
        force: set[str] = set()
        drop: set[str] = set()
        if move.notify_user_ids is not None:
            audience = self.c.moves.audience_ids(move_id)
            force = set(move.notify_user_ids) & audience
            drop = set(audience) - force
        return await self.notify_move(move_id, force, drop)

    async def on_move_joined(self, move_id: str, user_id: str) -> None:
        move = self.c.moves.get(move_id)
        if move is None or move.status != "live" or user_id == move.creator_id:
            return
        people = People.load(self.session, [move.creator_id, user_id])
        joiner, creator = people.first(user_id), people.first(move.creator_id)
        status = next(
            (p.status for p in move.participants if p.user_id == user_id), "going"
        )
        await self.c.notifier.send(
            move.creator_id,
            "joined_your_move",
            f"{joiner} joined your Move",
            f"{joiner} is here." if status == "there" else f"{joiner} is on the way.",
            _move_data(move),
        )
        await self._second_order(move, user_id, joiner, creator)

    # --- pipeline -------------------------------------------------------------

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        move = self.c.moves.get(move_id)
        if move is None or move.status != "live":
            return []
        audience = self.c.moves.audience_ids(move_id)
        candidate_ids = self.candidates(move, audience)
        picks = await self._pick(
            move.creator_id,
            text=move.text,
            category=move.category,
            mark_id=move.mark.id,
            mark_name=move.mark.name,
            candidate_ids=candidate_ids,
            audience_size=len(audience),
            there=[p.user_id for p in move.participants if p.status == "there"],
            force=set(force_ids) & candidate_ids,
            drop=set(drop_ids),
        )
        people = People.load(self.session, [move.creator_id])
        for p in picks:
            await self.c.notifier.send(
                p.user_id,
                "move_nudge",
                f"{people.first(move.creator_id)}'s Move",
                p.copy,
                {**_move_data(move), "reason": p.reason},
            )
        return picks

    def candidates(self, move: MoveSnapshot, audience: Iterable[str]) -> set[str]:
        participants = {p.user_id for p in move.participants}
        together = self._cluster([move.creator_id, *participants])
        notified = self._already_notified(move.id)
        pool = set(audience) - participants - together - notified - {move.creator_id}
        return pool - self._quiet(pool)

    async def notify_preview(
        self,
        user_id: str,
        *,
        mark_id: str,
        text: str,
        category: str | None = None,
        circle_ids: Sequence[str] = (),
        user_ids: Sequence[str] = (),
    ) -> list[NotifyPickOut]:
        """Picks for a draft that is not posted: nothing is stored or sent."""
        audience = self.resolve_audience(user_id, circle_ids, user_ids)
        mark = self.c.marks.get(mark_id) or self.session.get(Mark, mark_id)
        mark_name = mark.name if mark else "your spot"
        cat: Category = category or (mark.category if mark else "other")  # type: ignore[assignment]
        pool = set(audience) - self._cluster([user_id]) - {user_id}
        pool -= self._quiet(pool)
        return await self._pick(
            user_id,
            text=text,
            category=cat,
            mark_id=mark_id,
            mark_name=mark_name,
            candidate_ids=pool,
            audience_size=len(audience),
            there=[],
            force=set(),
            drop=set(),
        )

    def resolve_audience(
        self, user_id: str, circle_ids: Sequence[str], user_ids: Sequence[str]
    ) -> set[str]:
        """Read-only mirror of core's rule: own circles' members plus direct
        picks, minus the hidden-from list, minus self."""
        members: set[str] = set(user_ids)
        if circle_ids:
            rows = self.session.exec(
                select(CircleMember.user_id)
                .join(Circle, col(Circle.id) == col(CircleMember.circle_id))
                .where(col(Circle.id).in_(list(circle_ids)), Circle.owner_id == user_id)
            ).all()
            members.update(rows)
        hidden = set(
            self.session.exec(
                select(Block.hidden_from_user_id).where(Block.user_id == user_id)
            ).all()
        )
        return members - hidden - {user_id}

    # --- internals ------------------------------------------------------------

    async def _pick(
        self,
        creator_id: str,
        *,
        text: str,
        category: Category,
        mark_id: str,
        mark_name: str,
        candidate_ids: set[str],
        audience_size: int,
        there: list[str],
        force: set[str],
        drop: set[str],
    ) -> list[NotifyPickOut]:
        candidate_ids = candidate_ids - (
            self._not_interested(candidate_ids, category) - force
        )
        if not candidate_ids:
            return []
        now = self.lane.now()
        people = People.load(self.session, [creator_id, *there, *candidate_ids])
        cands = load_candidates(
            self.session,
            creator_id,
            candidate_ids,
            now,
            Target.at(now, category, mark_id),
            calendar=self.c.calendar,
            people=people,
        )
        result = await notify_picker.pick(
            self.lane.runner,
            NotifyRequest(
                creator_id=creator_id,
                creator_first=people.first(creator_id),
                text=text,
                category=category,
                mark_name=mark_name,
                when=now,
                candidates=cands,
                audience_size=audience_size,
                there=[(u, people.first(u)) for u in there if u != creator_id],
                force_ids=frozenset(force),
                drop_ids=frozenset(drop),
            ),
        )
        return result.picks

    async def _second_order(
        self, move: MoveSnapshot, joiner_id: str, joiner: str, creator: str
    ) -> None:
        audience = self.c.moves.audience_ids(move.id)
        pool = self.candidates(move, audience) - {joiner_id}
        pool -= self._not_interested(pool, move.category)
        if not pool:
            return
        now = self.lane.now()
        cands = load_candidates(
            self.session,
            joiner_id,
            pool,
            now,
            Target.at(now, move.category, move.mark.id),
            calendar=self.c.calendar,
        )
        close = [
            c
            for c in cands
            if not c.busy and (c.features.is_close_friend or c.features.hangouts_30d)
        ][:SECOND_ORDER_MAX]
        for c in close:
            await self.c.notifier.send(
                c.user_id,
                "friend_pulling_up",
                f"{joiner} is pulling up",
                f"Hey {c.first_name}, {joiner}'s pulling up to {creator}'s Move: "
                f'"{move.text}" at {move.mark.name}.',
                {**_move_data(move), "joiner_id": joiner_id},
            )

    def _cluster(self, user_ids: Iterable[str]) -> set[str]:
        together: set[str] = set()
        for uid in set(user_ids):
            together |= self.c.proximity.copresent_cluster(uid)
        return together

    def _already_notified(self, move_id: str) -> set[str]:
        rows = self.session.exec(
            select(Notification).where(col(Notification.type).in_(NUDGE_TYPES))
        ).all()
        return {n.user_id for n in rows if n.data.get("move_id") == move_id}

    def _not_interested(self, user_ids: Collection[str], category: str) -> set[str]:
        """Users who chose Move categories and left `category` out."""
        if not user_ids:
            return set()
        rows = self.session.exec(
            select(UserSettings).where(col(UserSettings.user_id).in_(list(user_ids)))
        ).all()
        return {
            s.user_id
            for s in rows
            if s.move_categories and category not in s.move_categories
        }

    def _quiet(self, user_ids: Collection[str]) -> set[str]:
        if not user_ids:
            return set()
        now = self.lane.now()
        rows = self.session.exec(
            select(UserSettings).where(col(UserSettings.user_id).in_(list(user_ids)))
        ).all()
        return {s.user_id for s in rows if in_quiet_hours(s, now)}


def _move_data(move: MoveSnapshot) -> dict[str, str]:
    return {"move_id": move.id, "route": f"/move/{move.id}"}
