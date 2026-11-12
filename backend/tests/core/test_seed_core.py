"""The core seed world (C10, ARCHITECTURE.md 15.1). The only core tests that
may use the seed."""

import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, col, create_engine, func, select

from app.core import db
from app.domain import moves as rules
from app.domain.privacy import can_see, resolve_audience
from app.ports import Category
from app.repositories.audience import SqlAudienceRepository
from app.repositories.moves import SqlMoveRepository
from app.seed import core, ids
from app.tables import (
    AutojoinPref,
    Block,
    Circle,
    CircleMember,
    Friendship,
    Mark,
    Moment,
    MomentTag,
    Move,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    SavedMark,
    User,
    UserSettings,
)

BACKEND = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 11, 12, 20, 10, tzinfo=UTC)  # 2:10 pm in Richardson
CORE_TABLES: tuple[type[SQLModel], ...] = (
    User,
    Friendship,
    Circle,
    CircleMember,
    Block,
    UserSettings,
    AutojoinPref,
    Mark,
    SavedMark,
    Move,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    Moment,
    MomentTag,
)
CATEGORIES: set[Category] = {
    "food",
    "coffee",
    "study",
    "fitness",
    "nightlife",
    "outdoors",
    "games",
    "shopping",
    "errand",
    "other",
}


class FixedClock:
    def __init__(self, now: datetime = NOW) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


def seed(engine: Engine, now: datetime = NOW) -> None:
    with Session(engine) as session:
        core.seed(session, FixedClock(now))
        session.commit()


def dump(engine: Engine) -> dict[str, list[dict[str, Any]]]:
    with Session(engine) as session:
        return {
            table.__name__: sorted(
                (row.model_dump() for row in session.exec(select(table)).all()),
                key=repr,
            )
            for table in CORE_TABLES
        }


@pytest.fixture
def world(engine: Engine, session: Session) -> Session:
    seed(engine)
    return session


def count(session: Session, table: type[SQLModel]) -> int:
    return session.exec(select(func.count()).select_from(table)).one()


def participants(session: Session, move_id: str) -> dict[str, MoveParticipant]:
    rows = session.exec(
        select(MoveParticipant).where(MoveParticipant.move_id == move_id)
    ).all()
    return {row.user_id: row for row in rows}


def audience(session: Session, move_id: str) -> set[str]:
    return set(SqlMoveRepository(session).audience_ids(move_id))


# --- Runs ---------------------------------------------------------------------


def test_seed_is_deterministic_for_a_fixed_clock(engine: Engine) -> None:
    other = db.make_engine(db.MEMORY)
    db.create_all(other)
    seed(engine)
    seed(other)
    assert dump(engine) == dump(other)


def test_reseed_after_reset_rebuilds_the_same_world(engine: Engine) -> None:
    seed(engine)
    first = dump(engine)
    db.reset(engine)
    seed(engine)
    assert dump(engine) == first


def test_times_follow_the_clock(engine: Engine, session: Session) -> None:
    later = NOW + timedelta(days=30)
    seed(engine, later)
    tony = session.get_one(Move, ids.MOVE_TONY_KUMO)
    assert tony.starts_at == later - timedelta(minutes=25)
    saved = session.get_one(SavedMark, (ids.ANISH, ids.KUMO_MATCHA))
    assert saved.saved_at == later - timedelta(days=3)


def test_command_line_runner_builds_the_world(tmp_path: Path) -> None:
    path = tmp_path / "app.db"
    env = {**os.environ, "DB_PATH": str(path)}
    subprocess.run(
        [sys.executable, "-m", "app.seed.seed"], cwd=BACKEND, env=env, check=True
    )
    with Session(create_engine(f"sqlite:///{path}")) as session:
        assert count(session, User) == len(core.PEOPLE)
        assert session.get(Move, ids.MOVE_TONY_KUMO) is not None


# --- People and audiences -----------------------------------------------------


def test_cast_is_present_and_verified(world: Session) -> None:
    users = {u.id: u for u in world.exec(select(User)).all()}
    assert set(users) == set(ids.CAST)
    assert 12 <= len(users) <= 15
    assert all(u.fb_verified and u.first_name for u in users.values())
    assert count(world, UserSettings) == len(users)


def test_friend_graph(world: Session) -> None:
    rows = world.exec(select(Friendship)).all()
    assert all(r.user_a < r.user_b for r in rows)
    anish = set(core.friends_of(ids.ANISH))
    assert anish == {
        ids.TONY,
        ids.MAYA,
        ids.PRIYA,
        ids.DEV,
        ids.DHIVYESH,
        ids.MOM,
        *ids.HS_FRIENDS,
    }
    assert ids.JORDAN not in anish
    assert set(ids.PICKLEBALL_CREW) <= set(core.friends_of(ids.JORDAN))


def test_anish_has_four_circles_and_mom_is_in_none(world: Session) -> None:
    circles = world.exec(select(Circle).where(Circle.owner_id == ids.ANISH)).all()
    by_id = {c.id: c for c in circles}
    assert set(by_id) == {
        ids.CIRCLE_ROOMMATES,
        ids.CIRCLE_CLIMBING,
        ids.CIRCLE_HS_FRIENDS,
        ids.CIRCLE_STUDY_GROUP,
    }
    assert by_id[ids.CIRCLE_CLIMBING].fb_group_name
    members = world.exec(
        select(CircleMember.user_id).where(col(CircleMember.circle_id).in_(by_id))
    ).all()
    assert ids.MOM not in members
    hs = world.exec(
        select(CircleMember.user_id).where(
            CircleMember.circle_id == ids.CIRCLE_HS_FRIENDS
        )
    ).all()
    assert set(hs) == set(ids.HS_FRIENDS)


def test_mom_is_hidden_from_anish(world: Session) -> None:
    repo = SqlAudienceRepository(world)
    assert repo.hidden_from(ids.ANISH) == {ids.MOM}
    assert world.get(Block, (ids.ANISH, ids.MOM)) is not None
    # A Move by Anish to every Circle and every friend still skips Mom.
    circles = repo.owned_circles(ids.ANISH, [c.id for c in core.CIRCLES])
    resolved = resolve_audience(
        ids.ANISH,
        {c.id: c.member_ids for c in circles},
        core.friends_of(ids.ANISH),
        repo.hidden_from(ids.ANISH),
    )
    assert resolved.user_ids == set(core.friends_of(ids.ANISH)) - {ids.MOM}


# --- Places -------------------------------------------------------------------


def test_marks_cover_every_category_around_the_center(world: Session) -> None:
    marks = world.exec(select(Mark)).all()
    assert 30 <= len(marks) <= 40
    assert {m.category for m in marks} == CATEGORIES
    assert any(m.name == "Kumo Matcha" for m in marks)
    lat, lng = core.CENTER
    assert all(abs(m.lat - lat) < 0.25 and abs(m.lng - lng) < 0.25 for m in marks)
    assert all(m.vibe_tags and m.source == "seed" for m in marks)


def test_every_key_mark_id_exists(world: Session) -> None:
    key_marks = {
        value
        for name, value in vars(ids).items()
        if name.isupper() and isinstance(value, str) and value.startswith("mk_")
    }
    assert key_marks
    for mark_id in key_marks:
        assert world.get(Mark, mark_id) is not None, mark_id


def test_anish_saved_kumo_from_the_reel_three_days_ago(world: Session) -> None:
    saved = world.get_one(SavedMark, (ids.ANISH, ids.KUMO_MATCHA))
    assert (saved.source, saved.source_ref) == ("reel", ids.REEL_KUMO)
    assert saved.saved_at == NOW - timedelta(days=3)


# --- Live Moves -----------------------------------------------------------------


def test_tony_is_at_kumo_with_two_friends(world: Session) -> None:
    move = SqlMoveRepository(world).get(ids.MOVE_TONY_KUMO)
    assert move is not None
    assert (move.status, move.creator_id, move.mark.id) == (
        "live",
        ids.TONY,
        ids.KUMO_MATCHA,
    )
    there = {p.user_id for p in move.participants if p.status == "there"}
    assert there == {ids.TONY, ids.MAYA, ids.DHIVYESH}
    # Anish can pull up, and Priya is in the audience for the second-order nudge.
    assert {ids.ANISH, ids.PRIYA} <= audience(world, ids.MOVE_TONY_KUMO)
    assert not rules.is_stale(move, NOW)


def test_jordan_hosts_an_open_pickleball_move_with_three_others(
    world: Session,
) -> None:
    move = SqlMoveRepository(world).get(ids.MOVE_JORDAN_PICKLEBALL)
    assert move is not None
    assert move.status == "live" and move.open
    assert move.mark.id == ids.PICKLEBALL_COURT
    there = {p.user_id for p in move.participants if p.status == "there"}
    assert there == {ids.JORDAN, *ids.PICKLEBALL_CREW}
    assert ids.ANISH not in audience(world, ids.MOVE_JORDAN_PICKLEBALL)
    assert not rules.is_stale(move, NOW)


def test_only_the_two_demo_moves_are_live(world: Session) -> None:
    live = world.exec(select(Move.id).where(Move.status == "live")).all()
    assert set(live) == {ids.MOVE_TONY_KUMO, ids.MOVE_JORDAN_PICKLEBALL}


# --- Ghosts and Moments -------------------------------------------------------


def test_last_night_left_ghosts_anish_can_see(world: Session) -> None:
    move = world.get_one(Move, ids.MOVE_LAST_NIGHT)
    assert move.status == "ended" and move.mark_id == ids.LAST_NIGHT_SPOT
    assert move.ends_at is not None and move.ends_at < NOW
    ghosts = participants(world, ids.MOVE_LAST_NIGHT)
    assert set(ghosts) == {ids.MAYA, ids.TONY, ids.PRIYA}
    for ghost in ghosts.values():
        assert ghost.status == "left" and ghost.arrived_at and ghost.left_at
        assert NOW - ghost.left_at < timedelta(hours=24)
        assert world.get_one(UserSettings, ghost.user_id).ghost_visible
    # Anish was in the audience and did not go: the FOMO tap.
    assert ids.ANISH in audience(world, ids.MOVE_LAST_NIGHT)
    assert SqlMoveRepository(world).get_visible(ids.MOVE_LAST_NIGHT, ids.ANISH)


def test_moments_from_last_night(world: Session) -> None:
    moments = world.exec(
        select(Moment).where(Moment.move_id == ids.MOVE_LAST_NIGHT)
    ).all()
    approved = [m for m in moments if m.status == "approved"]
    assert len(approved) >= 3
    move = world.get_one(Move, ids.MOVE_LAST_NIGHT)
    ghosts = participants(world, ids.MOVE_LAST_NIGHT)
    for moment in moments:
        assert moment.mark_id == ids.LAST_NIGHT_SPOT and moment.media_url
        assert moment.author_id in ghosts
        assert move.starts_at <= moment.created_at <= (move.ends_at or NOW)
        tags = world.exec(
            select(MomentTag).where(MomentTag.moment_id == moment.id)
        ).all()
        all_approved = all(tag.approved is True for tag in tags)
        assert (moment.status == "approved") == all_approved
        assert {tag.user_id for tag in tags} <= set(ghosts)


# --- Privacy ------------------------------------------------------------------


def test_audiences_follow_the_privacy_rules(world: Session) -> None:
    audiences = SqlAudienceRepository(world)
    moves = SqlMoveRepository(world)
    users = world.exec(select(User.id)).all()
    for move in world.exec(select(Move)).all():
        members = audience(world, move.id)
        assert move.creator_id not in members
        assert not members & audiences.hidden_from(move.creator_id)
        assert members <= set(core.friends_of(move.creator_id))
        visibility = audiences.move_visibility(move.id)
        assert visibility is not None
        for user_id in users:
            # The SQL filter and the domain rule agree for every user.
            visible = moves.get_visible(move.id, user_id) is not None
            assert visible == can_see(user_id, visibility), (move.id, user_id)


def test_strangers_and_mom_see_no_friend_moves(world: Session) -> None:
    moves = SqlMoveRepository(world)
    assert moves.list_live_visible(ids.MOM) == []
    assert [m.id for m in moves.list_live_visible(ids.ANISH)] == [ids.MOVE_TONY_KUMO]
    assert moves.get_visible(ids.MOVE_TONY_KUMO, ids.JORDAN) is None


def test_every_seed_mark_is_in_the_supported_area(world: Session) -> None:
    from app.core.areas import coarse_area

    marks = world.exec(select(Mark)).all()
    assert marks and {coarse_area(m.lat, m.lng) for m in marks} == {core.HOME_AREA}
