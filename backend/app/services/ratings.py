"""Rate a Move: Beli-style face + pairwise questions (surfaces S6, 13.1).

Flow: `questions` (face choices, vibe tags, first comparison) -> `next` after
each answer -> `submit`. Ranking itself is `domain/ranking`. Visibility goes
through `MoveService.get` (which applies `can_see`): a Move the rater may not
see is a 404. Only the creator or someone with a participant row may rate.

Submit rewrites the rater's ranked list for the Mark's category, stores the
Rating, fires `on_rating_submitted` (the taste agent listens) and then reads
the rater's taste profile for the result card.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.container import Container
from app.core.composition import build_move_service
from app.domain.errors import Conflict, Forbidden
from app.domain.ranking import Comparison, Face, apply, next_comparison
from app.hooks import Hooks
from app.muse.schemas import MarkOut
from app.ports import Category, MoveSnapshot
from app.repositories.ratings import SqlRatingRepository
from app.tables import Rating

RatingFace = Literal["loved", "fine", "not_for_us"]
Preferred = Literal["this", "other", "same"]

FACE_LABELS: tuple[tuple[RatingFace, str], ...] = (
    ("loved", "Loved it"),
    ("fine", "Fine"),
    ("not_for_us", "Not for us"),
)
VIBE_TAGS: tuple[str, ...] = (
    "aesthetic",
    "quiet",
    "loud",
    "cheap",
    "good seating",
    "fast",
    "worth the drive",
)
STARS: dict[str, int] = {"loved": 5, "fine": 3, "not_for_us": 1}
LIST_SIZE = 10


class NotAtMove(Forbidden):
    """Only the creator or a participant may rate a Move."""

    def __init__(self, move_id: str) -> None:
        super().__init__(f"only people at move {move_id} can rate it")
        self.move_id = move_id


class AlreadyRated(Conflict):
    def __init__(self, move_id: str) -> None:
        super().__init__(f"you already rated move {move_id}")
        self.move_id = move_id


# --- Shapes (A.6) ------------------------------------------------------------


class RatingAnswer(BaseModel):
    other_mark_id: str
    preferred: Preferred


class FaceChoice(BaseModel):
    key: RatingFace
    label: str


class RatingQuestions(BaseModel):
    move_id: str
    mark: MarkOut
    category: Category
    already_rated: bool
    faces: list[FaceChoice]
    vibe_tags: list[str]
    ranked_count: int
    first_comparison: MarkOut | None


class NextComparison(BaseModel):
    next_comparison: MarkOut | None


class RatingSubmit(BaseModel):
    face: RatingFace
    answers: list[RatingAnswer] = []
    vibe_tags: list[str] = Field(default_factory=list, max_length=12)
    note: str = Field(default="", max_length=500)


class RankedItem(BaseModel):
    mark: MarkOut
    score: float
    position: int


class TasteRead(BaseModel):
    summary: str
    likes: list[str]
    dislikes: list[str]
    updated_at: datetime


class RatingResult(BaseModel):
    mark: MarkOut
    category: Category
    position: int
    total: int
    score: float
    list: list[RankedItem]
    taste: TasteRead | None


# --- Service -----------------------------------------------------------------


def to_comparisons(mark_id: str, answers: list[RatingAnswer]) -> list[Comparison]:
    """API answers -> domain comparisons ('same' is a tie)."""
    return [Comparison(a.other_mark_id, _preferred(mark_id, a)) for a in answers]


def _preferred(mark_id: str, answer: RatingAnswer) -> str | None:
    if answer.preferred == "this":
        return mark_id
    if answer.preferred == "other":
        return answer.other_mark_id
    return None


class RatingService:
    def __init__(self, session: Session, container: Container, hooks: Hooks) -> None:
        self.session = session
        self.container = container
        self.hooks = hooks
        self.repo = SqlRatingRepository(session)

    def questions(self, user_id: str, move_id: str) -> RatingQuestions:
        move = self._visible(user_id, move_id)
        ranked, _ = self._ranked(user_id, move)
        first = next_comparison(ranked, move.mark.id, [])
        return RatingQuestions(
            move_id=move.id,
            mark=MarkOut.of(move.mark),
            category=move.mark.category,
            already_rated=self.repo.has_rating(move.id, user_id),
            faces=[FaceChoice(key=k, label=label) for k, label in FACE_LABELS],
            vibe_tags=list(VIBE_TAGS),
            ranked_count=len(ranked),
            first_comparison=self._mark_out(first),
        )

    def next(
        self, user_id: str, move_id: str, answers: list[RatingAnswer]
    ) -> NextComparison:
        move = self._visible(user_id, move_id)
        ranked, _ = self._ranked(user_id, move)
        comps = to_comparisons(move.mark.id, answers)
        return NextComparison(
            next_comparison=self._mark_out(next_comparison(ranked, move.mark.id, comps))
        )

    async def submit(
        self, user_id: str, move_id: str, body: RatingSubmit
    ) -> RatingResult:
        move = self._visible(user_id, move_id)
        if not _was_at(user_id, move):
            raise NotAtMove(move_id)
        if self.repo.has_rating(move_id, user_id):
            raise AlreadyRated(move_id)
        ranked, scores = self._ranked(user_id, move)
        comps = to_comparisons(move.mark.id, body.answers)
        items = apply(ranked, move.mark.id, Face(body.face), comps, scores)
        self._store(user_id, move, body, items)
        await self.hooks.on_rating_submitted.fire(move_id, user_id)
        return self._result(user_id, move, items)

    # --- Helpers -------------------------------------------------------------

    def _visible(self, user_id: str, move_id: str) -> MoveSnapshot:
        c = self.container
        return build_move_service(self.session, c.clock, c.events, self.hooks).get(
            user_id, move_id
        )

    def _ranked(
        self, user_id: str, move: MoveSnapshot
    ) -> tuple[list[str], dict[str, float]]:
        """The rater's list for the category without this Mark (a re-rating
        places it again from scratch), plus current scores."""
        rows = [
            r
            for r in self.repo.ranked(user_id, move.mark.category)
            if r.mark_id != move.mark.id
        ]
        return [r.mark_id for r in rows], {r.mark_id: r.score for r in rows}

    def _store(
        self,
        user_id: str,
        move: MoveSnapshot,
        body: RatingSubmit,
        items: list[tuple[str, float]],
    ) -> None:
        self.repo.replace_ranked(user_id, move.mark.category, items)
        self.repo.add_rating(
            Rating(
                move_id=move.id,
                user_id=user_id,
                mark_id=move.mark.id,
                stars=STARS[body.face],
                vibe_tags=[t.strip() for t in body.vibe_tags if t.strip()],
                note=body.note.strip(),
                comparisons=[a.model_dump() for a in body.answers],
                created_at=self.container.clock.now(),
            )
        )
        try:
            self.repo.commit()
        except IntegrityError as exc:
            self.repo.rollback()
            raise AlreadyRated(move.id) from exc

    def _result(
        self, user_id: str, move: MoveSnapshot, items: list[tuple[str, float]]
    ) -> RatingResult:
        marks = self.repo.marks(m for m, _ in items[:LIST_SIZE])
        position = next(i for i, (m, _) in enumerate(items, 1) if m == move.mark.id)
        top = [
            RankedItem(mark=MarkOut.of(marks[m]), score=s, position=i)
            for i, (m, s) in enumerate(items[:LIST_SIZE], 1)
            if m in marks
        ]
        taste = self.repo.taste(user_id)
        return RatingResult(
            mark=MarkOut.of(move.mark),
            category=move.mark.category,
            position=position,
            total=len(items),
            score=items[position - 1][1],
            list=top,
            taste=TasteRead.model_validate(taste, from_attributes=True)
            if taste
            else None,
        )

    def _mark_out(self, mark_id: str | None) -> MarkOut | None:
        if mark_id is None:
            return None
        mark = self.repo.marks([mark_id]).get(mark_id)
        return MarkOut.of(mark) if mark else None


def _was_at(user_id: str, move: MoveSnapshot) -> bool:
    return user_id == move.creator_id or any(
        p.user_id == user_id for p in move.participants
    )
