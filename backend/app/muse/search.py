"""Muse search (docs/MUSE_SEARCH.md): what the map's search box does.

One Muse call plans the request (`agents/search_planner.py`); everything
after that is deterministic and reuses what the MCP tools use: friend names
resolve through the `PeopleDirectory`, drafts are held by the glasses
`GlassesService` (with the named people as the only audience) and posted only
by `confirm` after the user's tap. Places for a group and who to ask come
from the rankings (`search_data.py`, `domain/recommend.py`).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace

from sqlmodel import Session

from app.muse import search_data
from app.muse.agents.search_planner import SearchPlan, plan
from app.muse.compose import ComposeService
from app.muse.lane import MuseLane
from app.muse.search_data import PersonView, PlaceView
from app.ports import MarkSnapshot, MoveDraftOut
from app.services.glasses import CommandResult, ConfirmResult
from app.services.mcp_tools import MovesTools, Person, _pick

Coarse = tuple[float, float] | None


@dataclass(frozen=True, slots=True)
class DraftCard:
    draft_id: str
    text: str
    place: str
    recipients: tuple[str, ...]
    audience: str
    expires_at: str | None


@dataclass(frozen=True, slots=True)
class Option:
    label: str
    user_id: str | None = None
    mark_id: str | None = None


@dataclass(frozen=True, slots=True)
class Clarify:
    field: str  # "person" | "place" | "text"
    question: str
    name: str | None = None
    options: tuple[Option, ...] = ()


@dataclass(frozen=True, slots=True)
class SearchResult:
    kind: str  # draft | people | places | clarify | answer
    message: str
    source: str = "heuristic"
    text: str = ""
    draft: DraftCard | None = None
    people: tuple[PersonView, ...] = ()
    places: tuple[PlaceView, ...] = ()
    clarify: Clarify | None = None


@dataclass
class Resolved:
    people: list[Person] = field(default_factory=list)
    stop: SearchResult | None = None


class MuseSearch:
    def __init__(self, session: Session, lane: MuseLane, tools: MovesTools) -> None:
        self.session = session
        self.lane = lane
        self.tools = tools
        self.me = tools.me

    # -- entry points --------------------------------------------------------

    async def search(
        self,
        text: str,
        picks: Mapping[str, str] | None = None,
        mark_id: str | None = None,
        coarse: Coarse = None,
    ) -> SearchResult:
        p, fell_back = await plan(self.lane.runner, self.me, text)
        source = "heuristic" if fell_back else "muse"
        result = await self._run(p, dict(picks or {}), mark_id, coarse)
        return _with(result, source=source, message=result.message or p.message)

    async def draft(
        self,
        text: str,
        user_ids: Sequence[str] = (),
        mark_id: str | None = None,
        coarse: Coarse = None,
    ) -> SearchResult:
        """From a tap on a people / places card: no Muse call."""
        friends = search_data.friend_ids(self.session, self.me)
        ids = [u for u in dict.fromkeys(user_ids) if u in friends]
        names = self.tools.people.names(ids)
        people = [Person(u, names.get(u, "a friend"), "", None, True) for u in ids]
        mark = self._mark(mark_id)
        return await self._draft(text, people, mark, coarse, category=None)

    async def confirm(self, draft_id: str) -> ConfirmResult:
        return await self.tools.glasses.confirm(self.me, draft_id)

    # -- plan execution ----------------------------------------------------------

    async def _run(
        self, p: SearchPlan, picks: dict[str, str], mark_id: str | None, coarse: Coarse
    ) -> SearchResult:
        if p.action == "clarify":
            q = p.question or "What do you want to do?"
            return SearchResult("clarify", q, clarify=Clarify("text", q))
        resolved = self._resolve(p.people, picks)
        if resolved.stop is not None:
            return _with(resolved.stop, text=p.text)
        if p.action == "who":
            return self._who(p)
        if p.action == "where":
            return self._where(p, resolved.people)
        mark = self._mark(mark_id)
        if mark is None and p.place:
            mark = self.tools.place_by_name(p.place)
            if mark is None:
                return self._ask_place(p, resolved.people, f"No {p.place} on the map.")
        if mark is None and p.pick_place:
            mark = self._best_place(p, resolved.people)
        return await self._draft(p.text, resolved.people, mark, coarse, p.category)

    def _resolve(self, names: list[str], picks: dict[str, str]) -> Resolved:
        lowered = {k.lower(): v for k, v in picks.items()}
        friends = search_data.friend_ids(self.session, self.me)
        out = Resolved()
        for name in names:
            picked = lowered.get(name.lower())
            if picked and picked in friends:
                label = self.tools.people.names([picked]).get(picked, name)
                out.people.append(Person(picked, label, "", None, True))
                continue
            matches = self.tools.people.search(self.me, name)
            pool = _pick(name, [m for m in matches if m.is_friend and m.id != self.me])
            if len(pool) == 1:
                out.people.append(pool[0])
            elif pool:
                options = tuple(
                    Option(
                        f"{m.name}" + (f" @{m.username}" if m.username else ""), m.id
                    )
                    for m in pool[:6]
                )
                q = f"Which {name}?"
                out.stop = SearchResult(
                    "clarify", q, clarify=Clarify("person", q, name, options)
                )
                return out
            elif matches:
                return Resolved(stop=SearchResult("answer", _not_friend(name)))
            else:
                return Resolved(stop=SearchResult("answer", f"No one named {name}."))
        return out

    def _who(self, p: SearchPlan) -> SearchResult:
        now = self.lane.now()
        people = search_data.people_for(self.session, self.me, p.category, now)
        if not people:
            return SearchResult("answer", "Add a few friends first, then ask again.")
        names = " + ".join(v.first_name for v in people[:2])
        return SearchResult(
            "people", f"{names} are most likely in.", text=p.text, people=tuple(people)
        )

    def _where(self, p: SearchPlan, people: list[Person]) -> SearchResult:
        places = search_data.group_places(
            self.session, self.me, [x.id for x in people], p.category
        )
        if not places:
            return SearchResult("answer", "No ranked spots for that yet.")
        who = "you and " + " + ".join(x.first_name or x.name for x in people)
        line = f"Top spots for {who}." if people else "Your top spots."
        return SearchResult("places", line, text=p.text, places=tuple(places))

    def _best_place(self, p: SearchPlan, people: list[Person]) -> MarkSnapshot | None:
        places = search_data.group_places(
            self.session, self.me, [x.id for x in people], p.category, limit=1
        )
        return self._mark(places[0].mark_id) if places else None

    def _ask_place(self, p: SearchPlan, people: list[Person], why: str) -> SearchResult:
        places = search_data.group_places(
            self.session, self.me, [x.id for x in people], p.category
        )
        options = tuple(Option(v.name, mark_id=v.mark_id) for v in places)
        q = f"{why} Where at?".strip()
        return SearchResult(
            "clarify", q, text=p.text, clarify=Clarify("place", q, options=options)
        )

    async def _draft(
        self,
        text: str,
        people: list[Person],
        mark: MarkSnapshot | None,
        coarse: Coarse,
        category: str | None,
    ) -> SearchResult:
        lat, lng = coarse if coarse else (None, None)
        said = text or (f"getting {category}" if category else "")
        result = await self.tools.glasses.draft_from_text(
            self.me, said, lat, lng, place=mark, user_ids=tuple(x.id for x in people)
        )
        if result.needs_place or result.draft_id is None:
            p = SearchPlan(text=result.text or said, category=result.category)
            return self._ask_place(p, people, "")
        card = self._card(result, people)
        line = f"{card.text} at {card.place}. Send it?"
        return SearchResult("draft", line, text=card.text, draft=card)

    def _card(self, result: CommandResult, people: list[Person]) -> DraftCard:
        draft = result.draft
        return DraftCard(
            draft_id=result.draft_id or "",
            text=result.text or "",
            place=result.place or "",
            recipients=tuple(x.name for x in people),
            audience=self._audience(draft, people),
            expires_at=result.expires_at.isoformat() if result.expires_at else None,
        )

    def _audience(self, draft: MoveDraftOut | None, people: list[Person]) -> str:
        """Who will see the Move, said plainly (rule 4)."""
        if people:
            return f"Only {_join([x.name for x in people])} will see this"
        ids = draft.user_ids if draft else ()
        circles = len(draft.circle_ids) if draft else 0
        if not ids and not circles:
            return "Only you will see this until you add people"
        names = list(self.tools.people.names(ids).values())
        shown = _join(
            names[:3] + ([f"{len(names) - 3} more"] if len(names) > 3 else [])
        )
        extra = f" and {circles} circle{'s' if circles > 1 else ''}" if circles else ""
        return f"{shown or 'Your friends'}{extra} will see this"

    def _mark(self, mark_id: str | None) -> MarkSnapshot | None:
        return ComposeService(self.session, self.lane).mark(mark_id)


def _with(result: SearchResult, **changes: object) -> SearchResult:
    return replace(result, **changes)  # type: ignore[arg-type]


def _join(names: Sequence[str]) -> str:
    names = [n for n in names if n]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _not_friend(name: str) -> str:
    return f"{name} isn't one of your friends on Moves yet."
