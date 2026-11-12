"""Compose a Move draft (ARCHITECTURE.md 7.2, 10.4, 10.12).

`POST /muse/compose-move` and `MuseGateway.compose_move` both land here:
resolve the place (explicit Mark, else caption / nearest), write the text,
and prefill the user's default Circles.

User-facing calls must feel instant (10.12): the client asks once with
`heuristic=true` (templates only, no Muse call, returns at once) and again
without it; the Muse draft replaces the heuristic one when it lands. The
runner's 60 s cache makes a repeated tap free.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from app.muse.agents import move_writer, place_resolver
from app.muse.agents.move_writer import WriterInput
from app.muse.agents.place_resolver import ResolveInput, needs_confirmation
from app.muse.context import MAX_MARKS
from app.muse.lane import MuseLane
from app.ports import MarkSnapshot, MoveDraftOut, PlaceResolution
from app.tables import Mark, TasteProfile, UserSettings


@dataclass(frozen=True)
class Composed:
    draft: MoveDraftOut
    mark: MarkSnapshot | None
    confirm_place: bool
    source: str  # "muse" | "heuristic"


def snapshot(mark: Mark) -> MarkSnapshot:
    return MarkSnapshot(
        mark.id,
        mark.name,
        mark.category,
        mark.lat,
        mark.lng,
        mark.address,
        tuple(mark.vibe_tags),
        mark.photo_url,
        mark.price_level,
        mark.source,
    )


class ComposeService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane
        self.marks = lane.container.marks

    def mark(self, mark_id: str | None) -> MarkSnapshot | None:
        """Through `MarkGateway`, falling back to a read of `marks`."""
        if not mark_id:
            return None
        found = self.marks.get(mark_id)
        if found is None and (row := self.session.get(Mark, mark_id)) is not None:
            found = snapshot(row)
        return found

    def taste(self, user_id: str) -> str:
        row = self.session.exec(
            select(TasteProfile).where(
                TasteProfile.subject_type == "user", TasteProfile.subject_id == user_id
            )
        ).first()
        return row.summary if row else ""

    async def resolve_place(
        self,
        user_id: str,
        *,
        geotag_mark_id: str | None = None,
        caption: str | None = None,
        coarse: tuple[float, float] | None = None,
        frame_url: str | None = None,
        heuristic: bool = False,
    ) -> PlaceResolution:
        inp = ResolveInput(
            user_id,
            candidates=self.marks.nearest(*coarse, MAX_MARKS) if coarse else [],
            geotag=self.mark(geotag_mark_id),
            caption=caption,
            frame_url=frame_url,
        )
        if heuristic:
            return place_resolver.heuristic(inp)
        return await place_resolver.resolve(self.lane.runner, inp)

    async def compose(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
        heuristic: bool = False,
    ) -> Composed:
        nearby = self.marks.nearest(*coarse, MAX_MARKS) if coarse else []
        mark = self.mark(mark_id)
        confirm = False
        if mark is None and (seed_text or nearby):
            place = ResolveInput(user_id, candidates=nearby, caption=seed_text)
            if heuristic:
                res = place_resolver.heuristic(place)
            else:
                res = await place_resolver.resolve(self.lane.runner, place)
            mark = self.mark(res.mark_id)
            confirm = needs_confirmation(res)

        inp = WriterInput(
            user_id=user_id,
            mark=mark,
            when=self.lane.now(),
            taste=self.taste(user_id),
            seed_text=seed_text,
        )
        if heuristic:
            written = move_writer.fallback(inp)
        else:
            written = await move_writer.write(self.lane.runner, inp)

        settings = self.session.get(UserSettings, user_id)
        chips = [mark.name] if mark else []
        if mark and mark.vibe_tags:
            chips.append(mark.vibe_tags[0])
        draft = MoveDraftOut(
            mark_id=mark.id if mark else None,
            text=written.text,
            category=written.category,
            alternates=tuple(written.alternates),
            circle_ids=tuple(settings.default_circle_ids if settings else ()),
            chips=tuple(chips),
            nearby_mark_ids=tuple(m.id for m in nearby),
        )
        return Composed(draft, mark, confirm, "heuristic" if heuristic else "muse")
