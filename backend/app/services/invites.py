"""Share a Move with people who are not in the app or the group (ARCHITECTURE.md 9.4).

    create   anyone who can see a live Move makes a link; the app opens the
             phone's share sheet with the line and the link, so the text comes
             from the sharer's own number (iMessage, WhatsApp, anything).
    page     the public `/m/{token}` page reads the Move through the token:
             place, what's happening, first names of who's there. Ends with
             the Move.
    going    a guest taps "I'm pulling up" with just a first name; the sharer
             and the creator get a notification. No account needed.

The audience is never widened inside the app: guests are not users and see
only the page their link opens.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, func, select

from app.container import Container
from app.domain import invites as rules
from app.domain.invites import (
    InvalidInvite,
    InviteMoveGone,
    InviteNotAllowed,
    InviteNotFound,
)
from app.ports import Category, MoveSnapshot
from app.tables import MoveInvite, User

PRESENT = ("going", "there")


@dataclass(frozen=True, slots=True)
class InviteOut:
    id: str
    token: str
    url: str
    text: str
    body: str
    created_at: datetime
    opened_at: datetime | None = None
    open_count: int = 0
    guest_name: str | None = None
    responded_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class InvitePage:
    token: str
    live: bool
    inviter_first: str
    creator_first: str = ""
    move_text: str = ""
    mark_name: str = ""
    mark_address: str = ""
    category: Category = "other"
    lat: float = 0.0
    lng: float = 0.0
    photo_url: str | None = None
    starts_at: datetime | None = None
    people: tuple[str, ...] = ()
    guests: tuple[str, ...] = ()
    guest_name: str | None = None


class InviteService:
    def __init__(self, session: Session, container: Container) -> None:
        self.session = session
        self.c = container

    # --- sharer side -----------------------------------------------------

    def create(
        self, user: User, move_id: str, message: str | None, base_url: str
    ) -> InviteOut:
        move = self._visible_move(user.id, move_id)
        if move.status != "live":
            raise InviteMoveGone("This Move has ended")
        rules.check_invite_count(self._count(move_id))
        creator = self._first_names({move.creator_id}).get(move.creator_id, "")
        text = rules.clean_message(
            message, rules.invite_text(user.first_name, move.mark.name, creator)
        )
        row = MoveInvite(
            token=rules.new_token(),
            move_id=move_id,
            inviter_id=user.id,
            message=text,
            created_at=self.c.clock.now(),
        )
        self.session.add(row)
        self.session.commit()
        return self._out(row, base_url)

    def list_for(self, user: User, move_id: str, base_url: str) -> list[InviteOut]:
        """The creator sees every shared link; anyone else sees their own."""
        move = self._visible_move(user.id, move_id)
        query = select(MoveInvite).where(MoveInvite.move_id == move_id)
        if user.id != move.creator_id:
            query = query.where(MoveInvite.inviter_id == user.id)
        rows = self.session.exec(query.order_by(col(MoveInvite.created_at))).all()
        return [self._out(r, base_url) for r in rows]

    # --- guest side (public, token only) ---------------------------------

    def page(self, token: str, *, count_open: bool) -> InvitePage:
        row = self._row(token)
        if count_open:
            row.open_count += 1
            row.opened_at = row.opened_at or self.c.clock.now()
            self.session.add(row)
            self.session.commit()
        return self._page(row)

    async def going(self, token: str, name: str) -> InvitePage:
        row = self._row(token)
        guest = rules.clean_name(name)
        if not guest:
            raise InvalidInvite("Add your first name so they know who's coming")
        move = self.c.moves.get(row.move_id)
        if move is None or move.status != "live":
            raise InviteMoveGone("This Move has wrapped up")
        first_time = row.responded_at is None
        row.guest_name = guest
        row.responded_at = row.responded_at or self.c.clock.now()
        self.session.add(row)
        self.session.commit()
        if first_time:
            await self._tell_hosts(row, move, guest)
        return self._page(row)

    # --- helpers ---------------------------------------------------------

    def _visible_move(self, user_id: str, move_id: str) -> MoveSnapshot:
        move = self.c.moves.get(move_id)
        if move is None:
            raise InviteMoveGone("Move not found")
        participants = {p.user_id for p in move.participants}
        if (
            user_id != move.creator_id
            and user_id not in participants
            and user_id not in self.c.moves.audience_ids(move_id)
        ):
            raise InviteNotAllowed("You can only share Moves you can see")
        return move

    def _count(self, move_id: str) -> int:
        query = select(func.count()).where(MoveInvite.move_id == move_id)
        return int(self.session.exec(query).one())

    def _row(self, token: str) -> MoveInvite:
        row = self.session.exec(
            select(MoveInvite).where(MoveInvite.token == token)
        ).first()
        if row is None:
            raise InviteNotFound("This link doesn't work anymore")
        return row

    def _first_names(self, user_ids: set[str]) -> dict[str, str]:
        if not user_ids:
            return {}
        users = self.session.exec(select(User).where(col(User.id).in_(user_ids))).all()
        return {u.id: u.first_name for u in users}

    def _page(self, row: MoveInvite) -> InvitePage:
        move = self.c.moves.get(row.move_id)
        ids = {row.inviter_id} | ({move.creator_id} if move else set())
        names = self._first_names(ids)
        inviter = names.get(row.inviter_id, "A friend")
        if move is None or move.status != "live":
            return InvitePage(token=row.token, live=False, inviter_first=inviter)
        present = [p.user_id for p in move.participants if p.status in PRESENT]
        people = self._first_names(set(present))
        guests = self.session.exec(
            select(MoveInvite.guest_name).where(
                MoveInvite.move_id == move.id, col(MoveInvite.guest_name).is_not(None)
            )
        ).all()
        mark = move.mark
        return InvitePage(
            token=row.token,
            live=True,
            inviter_first=inviter,
            creator_first=names.get(move.creator_id, ""),
            move_text=move.text,
            mark_name=mark.name,
            mark_address=mark.address,
            category=mark.category,
            lat=mark.lat,
            lng=mark.lng,
            photo_url=mark.photo_url,
            starts_at=move.starts_at,
            people=tuple(people[u] for u in present if u in people),
            guests=tuple(g for g in guests if g),
            guest_name=row.guest_name,
        )

    async def _tell_hosts(
        self, row: MoveInvite, move: MoveSnapshot, guest: str
    ) -> None:
        data = {"move_id": move.id, "route": f"/move/{move.id}", "invite_id": row.id}
        title = f"{guest} is pulling up"
        for user_id in dict.fromkeys((row.inviter_id, move.creator_id)):
            body = (
                f"{guest} opened your link and is coming to {move.mark.name}."
                if user_id == row.inviter_id
                else f"{guest} got a link to your Move and is coming."
            )
            try:
                await self.c.notifier.send(
                    user_id, "joined_your_move", title, body, data
                )
            except Exception:  # a notification must never fail the guest's tap
                continue

    @staticmethod
    def _out(row: MoveInvite, base_url: str) -> InviteOut:
        url = rules.invite_url(base_url, row.token)
        return InviteOut(
            id=row.id,
            token=row.token,
            url=url,
            text=row.message,
            body=rules.share_body(row.message, url),
            created_at=row.created_at,
            opened_at=row.opened_at,
            open_count=row.open_count,
            guest_name=row.guest_name,
            responded_at=row.responded_at,
        )
