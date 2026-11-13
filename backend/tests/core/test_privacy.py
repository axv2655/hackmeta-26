"""Privacy (core C2): can_see, audience resolution, audience preview."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.domain.privacy import (
    MoveVisibility,
    can_see,
    resolve_audience,
    within_audience,
)
from app.main import create_app
from app.repositories.audience import SqlAudienceRepository, visible_to
from app.services.audience import AudienceService
from app.tables import (
    Block,
    Circle,
    CircleMember,
    Mark,
    Move,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    User,
)

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)

# --- Builders (local to this file) -------------------------------------------


def _user(session: Session, user_id: str, name: str | None = None) -> str:
    name = name or user_id.title()
    session.add(User(id=user_id, name=name, first_name=name, created_at=T0))
    return user_id


def _circle(session: Session, circle_id: str, owner: str, *members: str) -> str:
    session.add(Circle(id=circle_id, owner_id=owner, name=circle_id.title()))
    session.add_all(CircleMember(circle_id=circle_id, user_id=m) for m in members)
    return circle_id


def _block(session: Session, user_id: str, hidden_from: str) -> None:
    session.add(Block(user_id=user_id, hidden_from_user_id=hidden_from))


class World:
    """ana posts; bo/cy are in Roommates; dee is a direct pick; eli is a friend
    outside the audience; mom is in Roommates but blocked by ana."""

    def __init__(self, session: Session) -> None:
        for uid in ("ana", "bo", "cy", "dee", "eli", "mom"):
            _user(session, uid)
        self.roommates = _circle(session, "roommates", "ana", "bo", "cy", "mom")
        self.foreign = _circle(session, "foreign", "eli", "eli", "bo")
        _block(session, "ana", "mom")
        session.commit()
        self.service = AudienceService(SqlAudienceRepository(session))


@pytest.fixture
def world(session: Session) -> World:
    return World(session)


def _post_move(
    session: Session, service: AudienceService, *, picks: tuple[str, ...] = ()
) -> str:
    session.add(Mark(id="kumo", name="Kumo", category="coffee", lat=0, lng=0))
    session.add(
        Move(
            id="m1",
            creator_id="ana",
            mark_id="kumo",
            text="matcha?",
            category="coffee",
            starts_at=T0,
            created_at=T0,
        )
    )
    audience = service.resolve("ana", ["roommates"], picks)
    service.save("m1", audience)
    session.commit()
    return "m1"


# --- Pure domain -------------------------------------------------------------


MOVE = MoveVisibility(
    creator_id="ana",
    audience_ids=frozenset({"bo", "mom"}),
    participant_ids=frozenset({"ana", "pat"}),
    hidden_from_ids=frozenset({"mom"}),
)


class TestCanSee:
    def test_creator(self) -> None:
        assert can_see("ana", MOVE)

    def test_audience_member(self) -> None:
        assert can_see("bo", MOVE)

    def test_participant_outside_audience(self) -> None:
        assert can_see("pat", MOVE)

    def test_non_audience_friend(self) -> None:
        assert not can_see("eli", MOVE)

    def test_blocked_user_even_if_in_audience(self) -> None:
        assert not can_see("mom", MOVE)

    def test_blocked_participant(self) -> None:
        move = MoveVisibility("ana", frozenset(), frozenset({"x"}), frozenset({"x"}))
        assert not can_see("x", move)


class TestResolveAudience:
    def test_union_minus_blocks_minus_self(self) -> None:
        resolved = resolve_audience(
            "ana",
            circles={"c1": ["ana", "bo", "mom"], "c2": ["cy", "bo"]},
            user_ids=["dee", "ana"],
            hidden_from={"mom"},
        )
        assert resolved.user_ids == {"bo", "cy", "dee"}
        assert resolved.circle_ids == ("c1", "c2")

    def test_via_prefers_direct_then_first_circle(self) -> None:
        resolved = resolve_audience(
            "ana", {"c1": ["bo"], "c2": ["bo", "cy"]}, ["cy"], hidden_from=()
        )
        assert resolved.via == {"cy": "direct", "bo": "circle:c1"}

    def test_blocked_direct_pick_is_dropped(self) -> None:
        assert len(resolve_audience("ana", {}, ["mom"], {"mom"})) == 0

    def test_within_audience_limits_dedupes_and_keeps_none(self) -> None:
        resolved = resolve_audience("ana", {"c1": ["bo", "cy"]}, [], {"mom"})
        picks = ["cy", "mom", "ana", "dee", "bo", "cy"]
        assert within_audience(picks, resolved) == ("cy", "bo")
        assert within_audience(None, resolved) is None
        assert within_audience([], resolved) == ()


# --- Service and repository --------------------------------------------------


class TestAudienceService:
    def test_circle_only_member_is_in_audience(self, world: World) -> None:
        assert world.service.resolve("ana", ["roommates"], []).user_ids == {"bo", "cy"}

    def test_foreign_and_unknown_circles_and_users_are_ignored(
        self, world: World
    ) -> None:
        resolved = world.service.resolve("ana", ["foreign", "nope"], ["ghost", "dee"])
        assert resolved.user_ids == {"dee"}
        assert resolved.circle_ids == ()

    def test_preview_matches_resolve_and_never_lists_blocked(
        self, world: World
    ) -> None:
        preview = world.service.preview("ana", ["roommates"], ["dee", "mom"])
        resolved = world.service.resolve("ana", ["roommates"], ["dee", "mom"])
        ids = [p.id for p in preview.people]
        assert set(ids) == resolved.user_ids == {"bo", "cy", "dee"}
        assert preview.count == len(ids) == 3
        assert "mom" not in ids
        assert [c.name for c in preview.circles] == ["Roommates"]

    def test_save_stores_what_preview_showed(
        self, world: World, session: Session
    ) -> None:
        preview = world.service.preview("ana", ["roommates"], ["dee"])
        move_id = _post_move(session, world.service, picks=("dee",))
        stored = session.exec(
            select(MoveAudience.user_id).where(MoveAudience.move_id == move_id)
        ).all()
        assert set(stored) == {p.id for p in preview.people}
        assert session.exec(select(MoveAudienceCircle.circle_id)).all() == ["roommates"]

    @pytest.mark.parametrize(
        ("viewer", "expected"),
        [
            ("ana", True),  # creator
            ("bo", True),  # circle-only member
            ("dee", True),  # participant, not in audience
            ("eli", False),  # friend outside the audience
            ("mom", False),  # blocked, even as a Roommates member
            ("ghost", False),
        ],
    )
    def test_can_see_stored_move_and_sql_twin_agree(
        self, world: World, session: Session, viewer: str, expected: bool
    ) -> None:
        move_id = _post_move(session, world.service)
        session.add(
            MoveParticipant(
                move_id=move_id,
                user_id="dee",
                status="going",
                joined_via="tap",
                joined_at=T0,
            )
        )
        session.commit()
        assert world.service.can_see(viewer, move_id) is expected
        visible = session.exec(select(col(Move.id)).where(visible_to(viewer))).all()
        assert (move_id in visible) is expected

    def test_can_see_missing_move(self, world: World) -> None:
        assert not world.service.can_see("ana", "nope")


# --- HTTP --------------------------------------------------------------------


@pytest.fixture
def client(engine: Engine, world: World) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as client:
        yield client


class TestPreviewRoute:
    def test_preview_lists_audience_without_blocked(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/audience/preview",
            json={"circle_ids": ["roommates"], "user_ids": ["dee", "mom"]},
            headers={"X-User-Id": "ana"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 3
        assert body["circles"] == [{"id": "roommates", "name": "Roommates"}]
        assert [p["id"] for p in body["people"]] == ["bo", "cy", "dee"]
        assert set(body["people"][0]) == {
            "id",
            "name",
            "first_name",
            "avatar_url",
            "avatar_color",
            "fb_verified",
        }

    def test_unknown_user_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/audience/preview", json={}, headers={"X-User-Id": "ghost"}
        )
        assert response.status_code == 401
