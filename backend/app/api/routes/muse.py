"""Muse routes (ARCHITECTURE.md 14.2). Muse lane: M4, M5, M8.

POST /muse/notify-preview (M4), POST /muse/compose-move (M5),
POST /muse/suggest-spots (M8), POST /moves/{id}/notify (composer step 2),
GET /muse/status (is Muse live, or is every agent on its heuristic?),
POST /muse/search, /muse/search/draft, /muse/search/confirm (map search box)

(The issues name separate `muse_compose.py` / `muse_spots.py` modules; the
frozen `api/main.py` on this branch includes only this one, so all three
live here.)
"""

from dataclasses import asdict
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.db import SessionDep
from app.mcp_server import tools_for
from app.muse.client import client_kind, client_model
from app.muse.compose import ComposeService
from app.muse.http import CurrentUser, LaneDep
from app.muse.schemas import MarkOut, MoveDraftRead, picks_out
from app.muse.search import MuseSearch, SearchResult
from app.services.glasses import DraftExpired
from app.services.notify import NotifyService
from app.services.taste import TasteService

router = APIRouter(tags=["muse"])


class MuseStatus(BaseModel):
    client: Literal["http", "fake"]
    live: bool
    """The real client is configured and the token budget is not spent."""
    model: str | None
    vision: bool
    calls: int
    muse_calls: int
    fallbacks: int
    fallback_rate: float
    tokens_used: int
    budget_tokens: int | None
    budget_exhausted: bool


@router.get("/muse/status", response_model=MuseStatus)
def muse_status(lane: LaneDep) -> MuseStatus:
    """Which Muse client answers and how much of the budget is used."""
    runner = lane.runner
    stats = runner.get_stats()
    kind = client_kind(runner.client)
    return MuseStatus(
        client=kind,
        live=kind == "http"
        and not runner.budget_exhausted
        and not runner.deterministic,
        model=client_model(runner.client),
        vision=runner.supports_vision,
        calls=stats["calls"],
        muse_calls=stats["muse_calls"],
        fallbacks=stats["fallbacks"],
        fallback_rate=stats["fallback_rate"],
        tokens_used=runner.tokens_used,
        budget_tokens=runner.token_budget,
        budget_exhausted=runner.budget_exhausted,
    )


class NotifyPreviewBody(BaseModel):
    mark_id: str
    text: str
    category: str | None = None
    circle_ids: list[str] = []
    user_ids: list[str] = []


@router.post("/muse/notify-preview")
async def notify_preview(
    body: NotifyPreviewBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[dict[str, Any]]:
    """`NotifyPick[]` for a draft that is not posted yet. Nothing is sent."""
    picks = await NotifyService(session, lane).notify_preview(
        user.id,
        mark_id=body.mark_id,
        text=body.text,
        category=body.category,
        circle_ids=body.circle_ids,
        user_ids=body.user_ids,
    )
    return picks_out(session, picks)


class NotifyMoveBody(BaseModel):
    """Who to nudge now. Posted Moves start with nobody notified when the
    composer sends `notify_user_ids: []`; this sends the confirmed list."""

    user_ids: list[str]


@router.post("/moves/{move_id}/notify")
async def notify_move(
    move_id: str,
    body: NotifyMoveBody,
    session: SessionDep,
    user: CurrentUser,
    lane: LaneDep,
) -> list[dict[str, Any]]:
    """Nudge exactly `user_ids` (only audience members; anyone already nudged
    for this Move is skipped). Only the creator may send. Returns who was
    nudged, with Muse's line and reason for each."""
    move = lane.container.moves.get(move_id)
    if move is None or move.status != "live":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Move not found")
    if move.creator_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the creator can notify")
    audience = lane.container.moves.audience_ids(move_id)
    force = set(body.user_ids) & audience
    picks = await lane.call(
        NotifyService, "notify_move", move_id, force, audience - force
    )
    return picks_out(session, picks)


class ComposeBody(BaseModel):
    lat: float | None = None
    lng: float | None = None
    mark_id: str | None = None
    seed_text: str | None = None
    heuristic: bool = False
    """True: templates only, instant. Call again without it for Muse's draft."""


@router.post("/muse/compose-move", response_model=MoveDraftRead)
async def compose_move(
    body: ComposeBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> MoveDraftRead:
    """`MoveDraft` for the composer. `lat/lng` are used for this query only and
    never stored. `confirm_place` asks the UI to show "Is this X?"."""
    coarse = (
        (round(body.lat, 3), round(body.lng, 3))
        if body.lat is not None and body.lng is not None
        else None
    )
    composed = await ComposeService(session, lane).compose(
        user.id,
        mark_id=body.mark_id,
        seed_text=body.seed_text,
        coarse=coarse,
        heuristic=body.heuristic,
    )
    return MoveDraftRead.of(
        session,
        composed.draft,
        mark=composed.mark,
        confirm_place=composed.confirm_place,
        source=composed.source,
    )


class SuggestSpotsBody(BaseModel):
    user_ids: list[str] = []
    category: str | None = None
    lat: float | None = None
    lng: float | None = None


class SpotOut(BaseModel):
    mark: MarkOut
    reason: str


@router.post("/muse/suggest-spots", response_model=list[SpotOut])
async def suggest_spots(
    body: SuggestSpotsBody, session: SessionDep, user: CurrentUser, lane: LaneDep
) -> list[SpotOut]:
    """3 Marks for the caller plus `user_ids`, with a reason each."""
    coarse = (
        (round(body.lat, 3), round(body.lng, 3))
        if body.lat is not None and body.lng is not None
        else None
    )
    spots = await TasteService(session, lane).suggest_spots(
        user.id, body.user_ids, category=body.category, coarse=coarse
    )
    return [SpotOut(mark=MarkOut.of(m), reason=reason) for m, reason in spots]


# --- Muse search (docs/MUSE_SEARCH.md) -------------------------------------------


class SearchBody(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    picks: dict[str, str] = {}
    mark_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class SearchDraftBody(BaseModel):
    text: str = Field(default="", max_length=300)
    user_ids: list[str] = Field(default=[], max_length=8)
    mark_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class SearchConfirmBody(BaseModel):
    draft_id: str


class SearchDraftOut(BaseModel):
    draft_id: str
    text: str
    place: str
    recipients: list[str]
    audience: str
    expires_at: str | None


class SearchPersonOut(BaseModel):
    user_id: str
    name: str
    first_name: str
    avatar_url: str
    avatar_color: str
    reason: str


class SearchPlaceOut(BaseModel):
    mark_id: str
    name: str
    category: str
    score: float | None
    reason: str


class SearchOptionOut(BaseModel):
    label: str
    user_id: str | None = None
    mark_id: str | None = None


class SearchClarifyOut(BaseModel):
    field: Literal["person", "place", "text"]
    question: str
    name: str | None = None
    options: list[SearchOptionOut] = []


class MuseSearchResult(BaseModel):
    kind: Literal["draft", "people", "places", "clarify", "answer"]
    message: str
    source: Literal["muse", "heuristic"]
    text: str
    draft: SearchDraftOut | None = None
    people: list[SearchPersonOut] = []
    places: list[SearchPlaceOut] = []
    clarify: SearchClarifyOut | None = None


class SearchPosted(BaseModel):
    move_id: str
    text: str


def _coarse(lat: float | None, lng: float | None) -> tuple[float, float] | None:
    return (
        (round(lat, 3), round(lng, 3)) if lat is not None and lng is not None else None
    )


def _searcher(session: SessionDep, user: CurrentUser, lane: LaneDep) -> MuseSearch:
    return MuseSearch(session, lane, tools_for(lane.container, user.id, lane.engine))


SearchDep = Annotated[MuseSearch, Depends(_searcher)]


def _out(result: SearchResult) -> MuseSearchResult:
    return MuseSearchResult.model_validate(asdict(result))


@router.post("/muse/search", response_model=MuseSearchResult)
async def muse_search(body: SearchBody, search: SearchDep) -> MuseSearchResult:
    """The map's search box: Muse plans the request once, the server drafts or
    suggests. Nothing is posted (see `/muse/search/confirm`)."""
    result = await search.search(
        body.text, body.picks, body.mark_id, _coarse(body.lat, body.lng)
    )
    return _out(result)


@router.post("/muse/search/draft", response_model=MuseSearchResult)
async def muse_search_draft(
    body: SearchDraftBody, search: SearchDep
) -> MuseSearchResult:
    """Draft from a tap on a people or places card. No Muse call."""
    result = await search.draft(
        body.text, body.user_ids, body.mark_id, _coarse(body.lat, body.lng)
    )
    return _out(result)


@router.post("/muse/search/confirm", response_model=SearchPosted)
async def muse_search_confirm(
    body: SearchConfirmBody, search: SearchDep
) -> SearchPosted:
    """Post the held draft exactly once (the user's tap). 409 if it expired."""
    try:
        result = await search.confirm(body.draft_id)
    except DraftExpired as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "That draft expired") from exc
    return SearchPosted(move_id=result.move_id, text=result.text)
