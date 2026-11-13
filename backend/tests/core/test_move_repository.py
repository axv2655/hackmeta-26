"""SqlMoveRepository (core C3): snapshot mapping, writes, visibility filtering."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlmodel import Session, col, select

from app.domain.errors import MarkNotFound
from app.domain.moves import NewMove, plan_move, stale_cutoff
from app.domain.privacy import ResolvedAudience
from app.ports import MarkSnapshot, MoveCreate, ParticipantSnapshot
from app.repositories.moves import SqlMoveRepository
from app.tables import (
    Block,
    Circle,
    Mark,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    User,
)

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
USERS = ("ana", "bo", "cy", "dee", "mom", "eli")


@pytest.fixture
def repo(session: Session) -> SqlMoveRepository:
    """ana's world: everyone exists, Kumo is a Mark, ana blocks mom."""
    session.add_all(
        User(id=u, name=u.title(), first_name=u.title(), created_at=T0) for u in USERS
    )
    session.add(
        Mark(
            id="kumo",
            name="Kumo Matcha",
            category="coffee",
            lat=30.28,
            lng=-97.74,
            address="1 Main",
            vibe_tags=["cozy", "study"],
            price_level=2,
        )
    )
    session.add(Block(user_id="ana", hidden_from_user_id="mom"))
    session.commit()
    return SqlMoveRepository(session)


def _audience(*user_ids: str, circles: tuple[str, ...] = ()) -> ResolvedAudience:
    return ResolvedAudience(via=dict.fromkeys(user_ids, "direct"), circle_ids=circles)


def _new(creator: str = "ana", at: datetime = T0, **draft: Any) -> NewMove:
    draft.setdefault("mark_id", "kumo")
    return plan_move(
        creator, MoveCreate(text="matcha?", category="coffee", **draft), at
    )


class TestCreateAndGet:
    def test_round_trip(self, repo: SqlMoveRepository, session: Session) -> None:
        new = _new(kind="flare", fill_minutes=5, open=True, notify_user_ids=("bo",))
        created = repo.create(new, _audience("bo", "mom"))
        session.commit()
        session.expunge_all()

        got = repo.get(created.id)
        assert got == created
        assert got is not None
        assert got.mark == MarkSnapshot(
            id="kumo",
            name="Kumo Matcha",
            category="coffee",
            lat=30.28,
            lng=-97.74,
            address="1 Main",
            vibe_tags=("cozy", "study"),
            price_level=2,
        )
        assert (got.kind, got.open, got.status) == ("flare", True, "live")
        assert got.fill_deadline == T0 + timedelta(minutes=5)
        assert got.starts_at == got.created_at == T0
        assert got.starts_at.tzinfo is not None
        assert got.notify_user_ids == ("bo",)
        assert got.participants == (new.creator,)

    def test_writes_audience_and_circles(
        self, repo: SqlMoveRepository, session: Session
    ) -> None:
        session.add(Circle(id="roomies", owner_id="ana", name="Roomies"))
        move = repo.create(_new(), _audience("bo", "cy", circles=("roomies",)))
        assert repo.audience_ids(move.id) == {"bo", "cy"}
        circles = session.exec(
            select(MoveAudienceCircle.circle_id).where(
                MoveAudienceCircle.move_id == move.id
            )
        ).all()
        assert circles == ["roomies"]

    def test_null_notify_list_stays_null(self, repo: SqlMoveRepository) -> None:
        move = repo.create(_new(), _audience())
        got = repo.get(move.id)
        assert got is not None
        assert got.notify_user_ids is None

    def test_unknown_mark(self, repo: SqlMoveRepository) -> None:
        with pytest.raises(MarkNotFound):
            repo.create(_new(mark_id="nope"), _audience())

    def test_get_unknown(self, repo: SqlMoveRepository) -> None:
        assert repo.get("nope") is None


class TestParticipants:
    def test_insert_then_update(
        self, repo: SqlMoveRepository, session: Session
    ) -> None:
        move = repo.create(_new(), _audience("bo"))
        bo = ParticipantSnapshot(
            user_id="bo",
            status="going",
            joined_via="tap",
            joined_at=T0 + timedelta(minutes=1),
        )
        repo.save_participant(move.id, bo)
        there = replace(bo, status="there", arrived_at=T0 + timedelta(minutes=9))
        repo.save_participant(move.id, there)
        session.commit()
        session.expunge_all()

        assert repo.participants(move.id) == (move.participants[0], there)
        rows = session.exec(
            select(MoveParticipant).where(MoveParticipant.move_id == move.id)
        ).all()
        assert len(rows) == 2

    def test_order_is_join_time(self, repo: SqlMoveRepository) -> None:
        move = repo.create(_new(), _audience())
        for user_id, minutes in (("cy", 5), ("bo", 5), ("dee", 2)):
            repo.save_participant(
                move.id,
                ParticipantSnapshot(
                    user_id=user_id,
                    status="going",
                    joined_via="tap",
                    joined_at=T0 + timedelta(minutes=minutes),
                ),
            )
        order = [p.user_id for p in repo.participants(move.id)]
        assert order == ["ana", "dee", "bo", "cy"]

    def test_add_audience_is_idempotent(
        self, repo: SqlMoveRepository, session: Session
    ) -> None:
        move = repo.create(_new(open=True), _audience("bo"))
        repo.add_audience(move.id, "eli", "open_ble")
        repo.add_audience(move.id, "eli", "open_ble")
        repo.add_audience(move.id, "bo", "open_ble")
        session.commit()
        assert repo.audience_ids(move.id) == {"bo", "eli"}
        via = session.exec(
            select(MoveAudience.via).where(
                MoveAudience.move_id == move.id, MoveAudience.user_id == "bo"
            )
        ).one()
        assert via == "direct"


class TestEnd:
    def test_set_ended(self, repo: SqlMoveRepository, session: Session) -> None:
        move = repo.create(_new(), _audience())
        repo.set_ended(move.id, "cancelled", T0 + timedelta(hours=1))
        session.commit()
        session.expunge_all()
        got = repo.get(move.id)
        assert got is not None
        assert (got.status, got.ends_at) == ("cancelled", T0 + timedelta(hours=1))

    def test_live_ids_started_before(self, repo: SqlMoveRepository) -> None:
        now = T0 + timedelta(hours=4)
        old = repo.create(_new(at=T0), _audience())
        edge = repo.create(_new(at=T0 + timedelta(hours=1)), _audience())
        fresh = repo.create(_new(at=T0 + timedelta(hours=2)), _audience())
        done = repo.create(_new(at=T0), _audience())
        repo.set_ended(done.id, "ended", T0)
        assert repo.live_ids_started_before(stale_cutoff(now)) == [old.id, edge.id]
        assert fresh.id not in repo.live_ids_started_before(now - timedelta(hours=3))


class TestVisibility:
    """ana posts to bo and mom (mom is blocked); cy joins over open BLE; dee
    and eli are outside."""

    @pytest.fixture
    def move_id(self, repo: SqlMoveRepository, session: Session) -> str:
        move = repo.create(_new(open=True), _audience("bo", "mom"))
        repo.save_participant(
            move.id,
            ParticipantSnapshot(
                user_id="cy", status="there", joined_via="open_ble", joined_at=T0
            ),
        )
        session.commit()
        return move.id

    @pytest.mark.parametrize(
        ("viewer", "visible"),
        [
            ("ana", True),
            ("bo", True),
            ("cy", True),
            ("mom", False),
            ("dee", False),
        ],
    )
    def test_get_visible(
        self, repo: SqlMoveRepository, move_id: str, viewer: str, visible: bool
    ) -> None:
        got = repo.get_visible(move_id, viewer)
        assert (got is not None) == visible
        if got is not None:
            assert got == repo.get(move_id)

    @pytest.mark.parametrize(
        ("viewer", "visible"),
        [("ana", True), ("bo", True), ("cy", True), ("mom", False), ("eli", False)],
    )
    def test_list_live_visible(
        self, repo: SqlMoveRepository, move_id: str, viewer: str, visible: bool
    ) -> None:
        ids = [m.id for m in repo.list_live_visible(viewer)]
        assert ids == ([move_id] if visible else [])

    def test_list_skips_ended_but_get_still_sees_it(
        self, repo: SqlMoveRepository, move_id: str
    ) -> None:
        repo.set_ended(move_id, "ended", T0 + timedelta(hours=1))
        assert repo.list_live_visible("bo") == []
        assert repo.get_visible(move_id, "bo") is not None

    def test_list_newest_first_with_participants(
        self, repo: SqlMoveRepository, move_id: str
    ) -> None:
        newer = repo.create(_new(at=T0 + timedelta(minutes=30)), _audience("bo"))
        theirs = repo.create(_new(creator="eli"), _audience("bo"))
        listed = repo.list_live_visible("bo")
        assert [m.id for m in listed] == [newer.id, *sorted([move_id, theirs.id])]
        by_id = {m.id: m for m in listed}
        assert [p.user_id for p in by_id[move_id].participants] == ["ana", "cy"]
        assert [p.user_id for p in by_id[theirs.id].participants] == ["eli"]

    def test_block_only_hides_the_blockers_moves(
        self, repo: SqlMoveRepository, session: Session, move_id: str
    ) -> None:
        theirs = repo.create(_new(creator="eli"), _audience("mom"))
        session.commit()
        assert [m.id for m in repo.list_live_visible("mom")] == [theirs.id]
        assert session.exec(select(col(Block.user_id))).all() == ["ana"]
