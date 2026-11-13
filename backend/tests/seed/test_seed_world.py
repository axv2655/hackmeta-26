"""The full demo seed (core, history, surfaces, muse) and the idempotent top-up,
on an in-memory database with a fixed clock (plan B.3)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, col, func, or_, select

from app.core import db
from app.core.config import settings
from app.domain.ranking import BANDS, Face, face_for
from app.main import create_app
from app.seed import ids, seed, surfaces, topup
from app.seed.history import GHOST_SAFE_GAP
from app.services.calendar import BusyBlock, free_window
from app.services.reels import mark_id_of
from app.tables import (
    CalendarEvent,
    Hangout,
    Mark,
    MarkRanking,
    Move,
    MoveAudience,
    MoveParticipant,
    PseudoGroup,
    Rating,
    Reel,
    SavedMark,
    SavedReel,
    TasteProfile,
    User,
)

NOW = datetime(2026, 11, 12, 20, 10, tzinfo=UTC)  # Thursday, 2:10 pm Central


class FixedClock:
    def __init__(self, now: datetime = NOW) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


@pytest.fixture(autouse=True)
def media_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "MEDIA_DIR", str(path))
    return path


@pytest.fixture
def world(session: Session) -> Session:
    seed.run(session, FixedClock())
    return session


def count(session: Session, table: type[SQLModel]) -> int:
    return session.exec(select(func.count()).select_from(table)).one()


def pair_hangouts(session: Session, a: str, b: str) -> list[Hangout]:
    low, high = sorted((a, b))
    stmt = select(Hangout).where(Hangout.user_a == low, Hangout.user_b == high)
    return list(session.exec(stmt).all())


# --- History -------------------------------------------------------------------


def test_anish_and_priya_have_coffee_hangouts(world: Session) -> None:
    coffee = [
        h for h in pair_hangouts(world, ids.ANISH, ids.PRIYA) if h.category == "coffee"
    ]
    assert len(coffee) >= 4
    assert len({h.mark_id for h in coffee}) == 4


def test_climbing_crew_stopped_four_weeks_ago(world: Session) -> None:
    climbs = [
        h for h in pair_hangouts(world, ids.ANISH, ids.MAYA) if h.category == "fitness"
    ]
    assert climbs
    assert all(h.mark_id == ids.CLIMBING_GYM for h in climbs)
    latest = max(h.at for h in climbs)
    assert NOW - latest >= timedelta(days=28)


def test_history_moves_are_ended_and_too_old_for_ghosts(world: Session) -> None:
    moves = world.exec(
        select(Move).where(col(Move.id).startswith(ids.HISTORY_MOVE_PREFIX))
    ).all()
    assert len(moves) >= 15
    assert all(m.status == "ended" and m.ends_at for m in moves)
    assert all(NOW - m.ends_at >= GHOST_SAFE_GAP for m in moves if m.ends_at)
    first = world.get_one(Move, ids.FIRST_HISTORY_MOVE)
    people = world.exec(
        select(MoveParticipant).where(MoveParticipant.move_id == first.id)
    ).all()
    assert {p.status for p in people} == {"left"}
    assert all(p.arrived_at and p.left_at for p in people)
    creator = [p for p in people if p.user_id == first.creator_id]
    assert creator[0].joined_via == "creator"
    audience = world.exec(
        select(MoveAudience.user_id).where(MoveAudience.move_id == first.id)
    ).all()
    assert set(audience) == {p.user_id for p in people} - {first.creator_id}


def test_matcha_hangouts_are_tuesday_afternoons_local(world: Session) -> None:
    coffee = [
        h for h in pair_hangouts(world, ids.ANISH, ids.PRIYA) if h.category == "coffee"
    ]
    assert {h.weekday for h in coffee} == {1}
    assert {h.hour_bucket for h in coffee} == {"afternoon"}


# --- Muse ----------------------------------------------------------------------


def test_fading_crew_for_anish(world: Session) -> None:
    groups = world.exec(
        select(PseudoGroup).where(PseudoGroup.owner_id == ids.ANISH)
    ).all()
    fading = [g for g in groups if g.fading]
    assert any(set(g.member_ids) == {ids.MAYA, ids.DEV} for g in fading)


def test_anish_taste_profile(world: Session) -> None:
    rows = world.exec(
        select(TasteProfile).where(TasteProfile.subject_id == ids.ANISH)
    ).all()
    assert len(rows) == 1 and "matcha" in rows[0].likes


# --- Surfaces ------------------------------------------------------------------


def test_anish_has_a_45_minute_window(world: Session) -> None:
    events = world.exec(
        select(CalendarEvent).where(CalendarEvent.user_id == ids.ANISH)
    ).all()
    gap = free_window([BusyBlock(e.starts_at, e.ends_at) for e in events], NOW)
    assert gap is not None
    assert gap.end - gap.start == timedelta(minutes=45)


@pytest.mark.parametrize("user_id", [ids.PRIYA, ids.TONY])
def test_priya_and_tony_are_free_for_four_hours(world: Session, user_id: str) -> None:
    events = world.exec(
        select(CalendarEvent).where(CalendarEvent.user_id == user_id)
    ).all()
    soon = NOW + timedelta(hours=4)
    assert not [e for e in events if e.ends_at > NOW and e.starts_at < soon]


def test_reels(world: Session) -> None:
    reels = {r.id: r for r in world.exec(select(Reel)).all()}
    assert set(reels) == {
        ids.REEL_KUMO,
        ids.REEL_NOBODY,
        ids.REEL_CAPTION,
        ids.REEL_EXTRA,
    }
    assert mark_id_of(reels[ids.REEL_KUMO]) == ids.KUMO_MATCHA
    assert mark_id_of(reels[ids.REEL_NOBODY]) == ids.QUIET_CAFE
    assert mark_id_of(reels[ids.REEL_CAPTION]) is None
    assert "Sunbeam Matcha Bar" in reels[ids.REEL_CAPTION].caption
    assert all(r.video_url.startswith("bundle:reel-") for r in reels.values())


def test_anish_saved_the_kumo_reel_three_days_ago(world: Session) -> None:
    saved = world.get_one(SavedReel, (ids.ANISH, ids.REEL_KUMO))
    assert NOW - saved.saved_at == timedelta(days=3)
    mark = world.get_one(SavedMark, (ids.ANISH, ids.KUMO_MATCHA))
    assert (mark.source, mark.source_ref) == ("reel", ids.REEL_KUMO)


def test_rankings_sit_in_their_face_bands(world: Session) -> None:
    rows = {(r.user_id, r.mark_id): r for r in world.exec(select(MarkRanking)).all()}
    marks = {m.id: m for m in world.exec(select(Mark)).all()}
    users = {user for user, _ in rows}
    assert users == {ids.ANISH, ids.PRIYA, ids.TONY, ids.MAYA, ids.DEV}
    for user_id, lists in surfaces.RANKS.items():
        for category, items in lists.items():
            assert 3 <= len(items) <= 5
            for position, (mark_id, face) in enumerate(items, start=1):
                row = rows[(user_id, mark_id)]
                low, high = BANDS[Face(face)]
                assert low <= row.score <= high
                assert row.position == position
                assert row.category == category == marks[mark_id].category


def test_anish_leaves_kumo_unranked(world: Session) -> None:
    assert world.get(MarkRanking, (ids.ANISH, ids.KUMO_MATCHA)) is None
    others = world.exec(
        select(MarkRanking).where(MarkRanking.mark_id == ids.KUMO_MATCHA)
    ).all()
    assert others


def test_ratings_sit_on_history_moves_the_user_attended(world: Session) -> None:
    ratings = world.exec(select(Rating)).all()
    assert len(ratings) >= 8
    for r in ratings:
        move = world.get_one(Move, r.move_id)
        assert move.mark_id == r.mark_id
        assert world.get(MoveParticipant, (r.move_id, r.user_id)) is not None
        ranked = world.get_one(MarkRanking, (r.user_id, r.mark_id))
        assert r.stars == surfaces.STARS[face_for(ranked.score)]


# --- Top-up --------------------------------------------------------------------

TABLES: tuple[type[SQLModel], ...] = (
    User,
    Mark,
    SavedMark,
    Move,
    MoveParticipant,
    MoveAudience,
    Hangout,
    Reel,
    SavedReel,
    CalendarEvent,
    MarkRanking,
    Rating,
    PseudoGroup,
    TasteProfile,
)


def snapshot(session: Session) -> dict[str, int]:
    return {t.__name__: count(session, t) for t in TABLES}


def core_only(session: Session) -> None:
    from app.seed import core

    core.seed(session, FixedClock())
    session.commit()


def test_topup_fills_a_core_only_world_like_a_full_seed(
    session: Session, engine: Engine
) -> None:
    core_only(session)
    counts = topup.topup(session, FixedClock())
    assert counts["history_moves"] >= 15
    assert counts["reels"] == 4 and counts["mark_rankings"] > 0
    assert counts["saved_marks"] == 0  # the core seed already has them
    full = db.make_engine(db.MEMORY)
    db.create_all(full)
    with Session(full) as other:
        seed.run(other, FixedClock())
        assert snapshot(session) == snapshot(other)


def test_topup_twice_inserts_nothing_and_keeps_real_users(session: Session) -> None:
    core_only(session)
    session.add(
        User(id="u_real", name="Real Person", first_name="Real", created_at=NOW)
    )
    session.commit()
    topup.topup(session, FixedClock())
    before = snapshot(session)
    groups = set(session.exec(select(PseudoGroup.id)).all())
    later = FixedClock(NOW + timedelta(days=2))
    counts = topup.topup(session, later)
    inserted = {k: v for k, v in counts.items() if k not in {"pseudo_groups"}}
    assert inserted == {**dict.fromkeys(inserted, 0), "taste_profiles": 1}
    assert snapshot(session) == before
    assert set(session.exec(select(PseudoGroup.id)).all()) == groups
    assert session.get(User, "u_real") is not None


def test_topup_keeps_a_users_own_ranking(session: Session) -> None:
    core_only(session)
    session.add(
        MarkRanking(
            user_id=ids.ANISH,
            mark_id=ids.KUMO_MATCHA,
            category="coffee",
            position=1,
            score=9.5,
        )
    )
    session.commit()
    topup.topup(session, FixedClock())
    coffee = session.exec(
        select(MarkRanking).where(
            MarkRanking.user_id == ids.ANISH, MarkRanking.category == "coffee"
        )
    ).all()
    assert [r.mark_id for r in coffee] == [ids.KUMO_MATCHA]
    other = session.exec(
        select(MarkRanking).where(
            MarkRanking.user_id == ids.ANISH,
            or_(MarkRanking.category == "food", MarkRanking.category == "study"),
        )
    ).all()
    assert other


def test_topup_needs_the_core_world(session: Session) -> None:
    with pytest.raises(topup.CoreWorldMissing):
        topup.topup(session, FixedClock())


# --- HTTP round trip -----------------------------------------------------------


@pytest.fixture
def client(engine: Engine, world: Session) -> Iterator[TestClient]:
    world.commit()

    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        client.headers["X-User-Id"] = ids.ANISH
        yield client


def test_reels_feed_serves_the_seeded_reels(client: TestClient) -> None:
    response = client.get("/api/v1/reels")
    assert response.status_code == 200
    reels = {r["id"]: r for r in response.json()}
    assert reels[ids.REEL_KUMO]["mark"]["id"] == ids.KUMO_MATCHA
    assert reels[ids.REEL_KUMO]["saved"] is True
    assert reels[ids.REEL_CAPTION]["mark"] is None
