"""Seed step owned by the surfaces lane (S11): Reels, calendar, saved Reels,
ratings and Mark rankings.

Runs after core and history. Every time is relative to `clock.now()` and
every row has a stable key, so `topup` can skip rows that already exist.

* Reels: `rl_kumo` is geotagged at Kumo (friends are there), `rl_nobody` at
  Wildflower (nobody there), `rl_caption` has no geotag but its caption names
  Sunbeam Matcha Bar (the place resolver demo), `rl_extra` is filler. Media
  use the `bundle:<mobile mock reel id>` convention.
* Calendar: Anish had a class this morning and has `CS 4349 lecture` 45 min
  from now, so his free window at seed time is 45 min. Priya and Tony are
  free for the next 4 h.
* Rankings: built with `ranking.apply` one Mark at a time (best first), so
  scores sit in their face bands exactly as a real rating would leave them.
  Anish never ranks Kumo Matcha, so rating it runs the pairwise step.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlmodel import Session, SQLModel

from app.domain.ranking import Comparison, Face, apply, next_comparison
from app.ports import Category, Clock
from app.seed import ids
from app.seed.core import PLACES
from app.seed.history import HistoryMove, history_moves
from app.tables import CalendarEvent, MarkRanking, Rating, Reel, SavedReel

# --- Reels ---------------------------------------------------------------------

# fmt: off
REELS: tuple[Reel, ...] = (
    Reel(id=ids.REEL_KUMO, author_name="Kumo Matcha",
         video_url="bundle:reel-kumo", thumb_url="bundle:reel-kumo",
         caption="Slow morning at the shop. Come study with us, the wifi is free "
                 "and the matcha is whisked to order.",
         geotag_mark_id=ids.KUMO_MATCHA, likes=8400),
    Reel(id=ids.REEL_NOBODY, author_name="Wildflower Coffee Co.",
         video_url="bundle:reel-emily", thumb_url="bundle:reel-emily",
         caption="Quiet corner, slow pour-over, an outlet at every seat.",
         geotag_mark_id=ids.QUIET_CAFE, likes=1900),
    Reel(id=ids.REEL_CAPTION, author_name="Dhivyesh Kumar",
         video_url="bundle:reel-dhivyesh", thumb_url="bundle:reel-dhivyesh",
         caption="Best iced matcha in Menlo Park? Sunbeam Matcha Bar on Santa Cruz "
                 "Ave. Not even close.",
         likes=2300),
    Reel(id=ids.REEL_EXTRA, author_name="Maya Chen",
         video_url="bundle:reel-maya", thumb_url="bundle:reel-maya",
         caption="Hiked four miles for this view and I would do it again tomorrow.",
         geotag_mark_id=ids.STANFORD_DISH, likes=987),
)
# fmt: on

SAVED_REELS: tuple[tuple[str, str, float], ...] = (
    # (user, reel, days ago). Anish's Saved Mark of Kumo is in the core seed.
    (ids.ANISH, ids.REEL_KUMO, 3),
)

# --- Calendar -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Block:
    id: str
    user_id: str
    title: str
    start_min: int  # minutes from now
    length_min: int
    location: str | None = None


BLOCKS: tuple[Block, ...] = (
    Block("cal_anish_section", ids.ANISH, "CS 4337 section", -180, 90, "ECSS 2.410"),
    Block("cal_anish_lecture", ids.ANISH, "CS 4349 lecture", 45, 75, "ECSS 2.415"),
    Block("cal_priya_lab", ids.PRIYA, "Bio lab", 300, 120, "FO 2.208"),
    Block("cal_tony_shift", ids.TONY, "Library shift", -240, 120),
)

# --- Rankings -------------------------------------------------------------------

L, F, N = Face.LOVED, Face.FINE, Face.NOT_FOR_US
STARS: dict[Face, int] = {L: 5, F: 3, N: 1}

# fmt: off
# Per user, per category: Marks best first, each with its face.
RANKS: dict[str, dict[Category, tuple[tuple[str, Face], ...]]] = {
    ids.ANISH: {
        "coffee": ((ids.MATCHA_MAIKO, L), (ids.MATCHA_LEAF_WHISK, L),
                   (ids.MATCHA_GREENROOM, F), ("mk_blue_bottle", N)),
        "food": ((ids.CHIPOTLE, L), ("mk_pho_city", F), (ids.HS_HANGOUT, F)),
        "fitness": ((ids.CLIMBING_GYM, L), (ids.PICKLEBALL_COURT, F),
                    ("mk_arrillaga_rec", F)),
        "study": ((ids.FOUNDERS_HALL, L), ("mk_menlo_library", F),
                  ("mk_coupa_cafe", N)),
    },
    ids.PRIYA: {
        "coffee": ((ids.KUMO_MATCHA, L), (ids.MATCHA_LEAF_WHISK, L),
                   (ids.MATCHA_MAIKO, F), (ids.FAT_STRAWS, F),
                   (ids.MATCHA_GREENROOM, F)),
        "food": (("mk_ramen_nagi", L), ("mk_orens_hummus", F),
                 ("mk_seoul_kalbi", F)),
        "fitness": (("mk_arrillaga_rec", L), (ids.PICKLEBALL_COURT, F),
                    (ids.CLIMBING_GYM, N)),
        "study": (("mk_green_library", L), (ids.FOUNDERS_HALL, F),
                  ("mk_coupa_cafe", F)),
    },
    ids.TONY: {
        "coffee": ((ids.KUMO_MATCHA, L), (ids.FAT_STRAWS, L),
                   (ids.MATCHA_MAIKO, F), ("mk_blue_bottle", F)),
        "food": ((ids.CHIPOTLE, L), ("mk_in_n_out", L), ("mk_seoul_kalbi", F),
                 ("mk_pho_city", N)),
        "fitness": ((ids.PICKLEBALL_COURT, L), ("mk_arrillaga_rec", F),
                    (ids.CLIMBING_GYM, F)),
        "study": (("mk_coupa_cafe", L), (ids.FOUNDERS_HALL, F),
                  ("mk_menlo_library", N)),
    },
    ids.MAYA: {
        "coffee": ((ids.KUMO_MATCHA, L), ("mk_cafe_borrone", F),
                   (ids.FAT_STRAWS, F)),
        "food": ((ids.CHIPOTLE, L), ("mk_orens_hummus", L), ("mk_ramen_nagi", F)),
        "fitness": ((ids.CLIMBING_GYM, L), ("mk_arrillaga_rec", F),
                    (ids.PICKLEBALL_COURT, N)),
        "study": (("mk_menlo_library", L), (ids.FOUNDERS_HALL, F),
                  ("mk_green_library", F)),
    },
    ids.DEV: {
        "coffee": (("mk_cafe_borrone", L), ("mk_blue_bottle", F),
                   (ids.KUMO_MATCHA, F)),
        "food": (("mk_seoul_kalbi", L), ("mk_pho_city", F), (ids.CHIPOTLE, F)),
        "fitness": ((ids.CLIMBING_GYM, L), ("mk_arrillaga_rec", L),
                    (ids.PICKLEBALL_COURT, F)),
        "study": ((ids.FOUNDERS_HALL, L), ("mk_green_library", L),
                  ("mk_coupa_cafe", F)),
    },
}
# fmt: on

VIBES: dict[str, tuple[str, ...]] = {
    place.id: tuple(place.vibes.split()) for place in PLACES
}


@dataclass(frozen=True, slots=True)
class Ranked:
    """One Mark's place in a user's list, with the answers that put it there."""

    user_id: str
    mark_id: str
    category: Category
    face: Face
    position: int
    score: float
    answers: tuple[Comparison, ...]


def build_ranking(
    user_id: str, category: Category, marks: Iterable[tuple[str, Face]]
) -> list[Ranked]:
    """Insert each Mark (best first) through `ranking.apply`, answering every
    question with "the one already ranked", so each lands at the bottom of its
    face band. Returns the final list, best first."""
    ranked: list[str] = []
    scores: dict[str, float] = {}
    faces: dict[str, Face] = {}
    answers_of: dict[str, tuple[Comparison, ...]] = {}
    for mark_id, face in marks:
        answers: list[Comparison] = []
        while (other := next_comparison(ranked, mark_id, answers)) is not None:
            answers = [*answers, Comparison(other=other, preferred=other)]
        result = apply(ranked, mark_id, face, answers, scores)
        ranked = [m for m, _ in result]
        scores = dict(result)
        faces = {**faces, mark_id: face}
        answers_of = {**answers_of, mark_id: tuple(answers)}
    return [
        Ranked(user_id, m, category, faces[m], i, scores[m], answers_of[m])
        for i, m in enumerate(ranked, start=1)
    ]


def all_rankings() -> list[Ranked]:
    return [
        item
        for user_id, lists in RANKS.items()
        for category, marks in lists.items()
        for item in build_ranking(user_id, category, marks)
    ]


# --- Rows -------------------------------------------------------------------------


def reel_rows() -> list[Reel]:
    return [Reel.model_validate(reel.model_dump()) for reel in REELS]


def saved_reel_rows(now: datetime) -> list[SavedReel]:
    return [
        SavedReel(user_id=u, reel_id=r, saved_at=now - timedelta(days=d))
        for u, r, d in SAVED_REELS
    ]


def calendar_rows(now: datetime) -> list[CalendarEvent]:
    return [
        CalendarEvent(
            id=b.id,
            user_id=b.user_id,
            title=b.title,
            starts_at=now + timedelta(minutes=b.start_min),
            ends_at=now + timedelta(minutes=b.start_min + b.length_min),
            location=b.location,
        )
        for b in BLOCKS
    ]


def ranking_rows() -> list[MarkRanking]:
    return [
        MarkRanking(
            user_id=r.user_id,
            mark_id=r.mark_id,
            category=r.category,
            position=r.position,
            score=r.score,
        )
        for r in all_rankings()
    ]


def rating_rows(moves: list[HistoryMove]) -> list[Rating]:
    """A Rating on the latest history Move where the user was at that Mark."""
    rows = []
    for r in all_rankings():
        move = _latest_visit(moves, r.user_id, r.mark_id)
        if move is not None:
            rows.append(_rating(r, move))
    return rows


def _latest_visit(
    moves: list[HistoryMove], user_id: str, mark_id: str
) -> HistoryMove | None:
    visits = [m for m in moves if m.mark_id == mark_id and user_id in m.user_ids]
    return max(visits, key=lambda m: m.ends_at, default=None)


def _rating(r: Ranked, move: HistoryMove) -> Rating:
    return Rating(
        id=f"rt_{move.id.removeprefix('mv_')}_{r.user_id.removeprefix('u_')}",
        move_id=move.id,
        user_id=r.user_id,
        mark_id=r.mark_id,
        stars=STARS[r.face],
        vibe_tags=list(VIBES.get(r.mark_id, ())[:2]),
        comparisons=[
            {"other_mark_id": a.other, "preferred": "other"} for a in r.answers
        ],
        created_at=move.ends_at + timedelta(hours=1),
    )


def rows(now: datetime) -> list[list[SQLModel]]:
    """Every surfaces row, in foreign-key order (Reels before saved Reels)."""
    return [
        [
            *reel_rows(),
            *calendar_rows(now),
            *ranking_rows(),
            *rating_rows(history_moves(now)),
        ],
        [*saved_reel_rows(now)],
    ]


def seed(session: Session, clock: Clock) -> None:
    for batch in rows(clock.now()):
        session.add_all(batch)
        session.flush()
