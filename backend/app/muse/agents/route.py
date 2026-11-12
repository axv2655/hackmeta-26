"""Route and ride suggestions (ARCHITECTURE.md 10.10).

Two audience members both `going` to the same Move, starting from the same
coarse area, when the Mark is not walkable from that area: one suggestion to
the first of them, "You and Dev are both heading to Kumo from campus. Go
together?". Accepting returns a prefilled draft. No ride booking.

Areas are coarse labels only (`users.last_area`, else `home_area`); the
server has no user coordinates. "Walkable" is decided from the label: a Mark
whose address or name mentions the area counts as walkable from it.

Runs on `on_move_joined` (lane wiring) and from Demo Control via
`MuseGateway.run_route`. At most one route suggestion per Move and pair.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.muse.context import AliasBook, People
from app.muse.lane import MuseLane
from app.ports import MarkSnapshot, MoveDraftOut, MoveSnapshot, SuggestionSnapshot
from app.services.suggestions import SuggestionService, draft_to_dict
from app.tables import Suggestion

AGENT = "route"
MAX_TOKENS = 150
EXPIRES = timedelta(minutes=60)


class RouteOut(BaseModel):
    message: str = Field(min_length=1)
    chips: list[str] = Field(default_factory=list)


def walkable(area: str, mark: MarkSnapshot) -> bool:
    a = area.strip().lower()
    return bool(a) and (a in mark.address.lower() or a in mark.name.lower())


def eligible_pair(
    going: Sequence[tuple[str, str | None]], mark: MarkSnapshot
) -> tuple[str, str, str] | None:
    """First two going users from the same area that is not walkable to the
    Mark: `(user_a, user_b, area)`."""
    by_area: dict[str, list[str]] = {}
    for uid, area in going:
        if area and not walkable(area, mark):
            by_area.setdefault(area, []).append(uid)
    for area, uids in by_area.items():
        if len(uids) >= 2:
            return uids[0], uids[1], area
    return None


class RouteService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane
        self.c = lane.container

    async def run_route(
        self, move_id: str, user_ids: Sequence[str] = ()
    ) -> SuggestionSnapshot | None:
        move = self.c.moves.get(move_id)
        if move is None or move.status != "live":
            return None
        allowed = set(self.c.moves.audience_ids(move_id)) | {move.creator_id}
        wanted = set(user_ids)
        going = [
            p.user_id
            for p in move.participants
            if p.status == "going"
            and p.user_id in allowed
            and (not wanted or p.user_id in wanted)
        ]
        people = People.load(self.session, going)
        areas = []
        for uid in going:
            u = people.users.get(uid)
            areas.append((uid, (u.last_area or u.home_area) if u else None))
        pair = eligible_pair(areas, move.mark)
        if pair is None or self._done(move_id, pair[:2]):
            return None
        a, b, area = pair
        return await self._suggest(move, a, b, area, people)

    def _done(self, move_id: str, pair: tuple[str, str]) -> bool:
        rows = self.session.exec(select(Suggestion).where(Suggestion.type == "route"))
        key = sorted(pair)
        return any(
            (r.payload or {}).get("move_id") == move_id
            and sorted((r.payload or {}).get("pair", [])) == key
            for r in rows
        )

    async def _suggest(
        self, move: MoveSnapshot, a: str, b: str, area: str, people: People
    ) -> SuggestionSnapshot:
        book, places = AliasBook("u"), AliasBook("k")
        ua, ub = book.alias(a, people.first(a)), book.alias(b, people.first(b))
        k = places.alias(move.mark.id, move.mark.name)
        prompt = (
            f"Reader: {{{ua}}}. Other: {{{ub}}}. Place: {{{k}}} "
            f"({move.category}). Coming from: {area}."
        )
        fallback = RouteOut(
            message=(
                f"You and {{{ub}}} are both heading to {{{k}}} from {area}. "
                "Go together?"
            ),
            chips=[f"both from {area}"],
        )
        out = await self.lane.runner.run_agent(
            AGENT,
            a,
            prompt,
            RouteOut,
            lambda: fallback,
            max_tokens=MAX_TOKENS,
            slow=True,
        )
        message = book.restore(out.message, places)
        chips = [book.restore(c, places) for c in out.chips[:2]]
        draft = MoveDraftOut(
            mark_id=move.mark.id,
            text=f"heading to {move.mark.name.lower()} together?"[:59],
            category=move.category,
            user_ids=(b,),
            chips=tuple(chips),
        )
        payload = {
            "message": message,
            "chips": chips,
            "draft": draft_to_dict(draft),
            "move_id": move.id,
            "pair": [a, b],
        }
        return await SuggestionService(self.session, self.lane).create_suggestion(
            a, "route", payload, self.lane.now() + EXPIRES
        )
