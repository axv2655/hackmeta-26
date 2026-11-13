"""S6: rating a Move, service level and one HTTP round trip (plan A.6)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.container import Container
from app.core import db
from app.domain.ranking import StaleComparison
from app.hooks import Hooks
from app.main import create_app
from app.scheduler.loop import Scheduler
from app.services.ratings import (
    AlreadyRated,
    NotAtMove,
    RatingAnswer,
    RatingService,
    RatingSubmit,
)
from app.tables import MarkRanking, Rating, TasteProfile
from tests.surfaces.factories import (
    T0,
    add_mark,
    add_move,
    add_participant,
    add_ranking,
    add_users,
)
from tests.surfaces.fakes import FixedClock, HookSpy

MOVE = "mv1"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def world(session: Session) -> Session:
    add_users(session, ["ana", "ben", "cal", "dee"])
    for mark in ("kumo", "a", "b", "c"):
        add_mark(session, mark)
    add_move(session, MOVE, "ana", "kumo", audience=["ben", "cal"], status="ended")
    add_participant(session, MOVE, "ben", status="left", left_at=T0)
    add_ranking(session, "ana", "a", 9.0, position=1)
    add_ranking(session, "ana", "b", 6.0, position=2)
    add_ranking(session, "ana", "c", 2.0, position=3)
    session.commit()
    return session


def service(session: Session, hooks: Hooks | None = None) -> RatingService:
    return RatingService(session, Container(clock=FixedClock(T0)), hooks or Hooks())


def ans(other: str, preferred: str) -> RatingAnswer:
    return RatingAnswer(other_mark_id=other, preferred=preferred)


@pytest.mark.anyio
class TestService:
    def test_questions_start_in_the_middle_of_the_list(self, world):
        q = service(world).questions("ana", MOVE)
        assert q.mark.id == "kumo"
        assert q.ranked_count == 3
        assert q.first_comparison.id == "b"
        assert [f.key for f in q.faces] == ["loved", "fine", "not_for_us"]
        assert not q.already_rated

    def test_next_walks_the_binary_search(self, world):
        svc = service(world)
        assert svc.next("ana", MOVE, [ans("b", "this")]).next_comparison.id == "a"
        done = svc.next("ana", MOVE, [ans("b", "this"), ans("a", "other")])
        assert done.next_comparison is None

    def test_stale_answer_is_invalid(self, world):
        with pytest.raises(StaleComparison):
            service(world).next("ana", MOVE, [ans("c", "this")])

    async def test_submit_rewrites_list_and_fires_hook(self, world):
        hooks, spy = Hooks(), HookSpy()
        hooks.on_rating_submitted.register(spy)
        body = RatingSubmit(
            face="loved", answers=[ans("b", "this"), ans("a", "other")], note=" yum "
        )
        result = await service(world, hooks).submit("ana", MOVE, body)
        assert [i.mark.id for i in result.list] == ["a", "kumo", "b", "c"]
        assert (result.position, result.total, result.score) == (2, 4, 7.0)
        assert spy.calls == [(MOVE, "ana")]
        rows = world.exec(select(MarkRanking).where(MarkRanking.user_id == "ana"))
        assert {r.mark_id: r.position for r in rows}["kumo"] == 2
        rating = world.exec(select(Rating)).one()
        assert (rating.stars, rating.note) == (5, "yum")
        assert rating.comparisons[0] == {"other_mark_id": "b", "preferred": "this"}

    async def test_same_answer_is_a_tie(self, world):
        body = RatingSubmit(face="fine", answers=[ans("b", "same")])
        result = await service(world).submit("ana", MOVE, body)
        assert [i.mark.id for i in result.list] == ["a", "b", "kumo", "c"]

    async def test_participant_may_rate_with_an_empty_list(self, world):
        result = await service(world).submit("ben", MOVE, RatingSubmit(face="fine"))
        assert (result.position, result.total, result.score) == (1, 1, 6.9)

    async def test_audience_member_who_never_came_is_forbidden(self, world):
        with pytest.raises(NotAtMove):
            await service(world).submit("cal", MOVE, RatingSubmit(face="fine"))

    async def test_second_rating_conflicts(self, world):
        await service(world).submit("ben", MOVE, RatingSubmit(face="fine"))
        with pytest.raises(AlreadyRated):
            await service(world).submit("ben", MOVE, RatingSubmit(face="loved"))
        assert service(world).questions("ben", MOVE).already_rated


# --- HTTP ---------------------------------------------------------------------


@pytest.fixture
def client(engine: Engine, world: Session) -> Iterator[tuple[TestClient, HookSpy]]:
    spy = HookSpy()

    async def write_taste(move_id: str, user_id: str) -> None:
        with Session(engine) as s:
            s.add(
                TasteProfile(
                    subject_type="user",
                    subject_id=user_id,
                    summary="Loves quiet coffee",
                    likes=["quiet"],
                    dislikes=[],
                    updated_at=T0,
                )
            )
            s.commit()

    def lane(container: Container, hooks: Hooks, scheduler: Scheduler) -> None:
        hooks.on_rating_submitted.register(spy)
        hooks.on_rating_submitted.register(write_taste)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=(lane,))
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as c:
        yield c, spy


def url(path: str = "") -> str:
    return f"/api/v1/moves/{MOVE}/rating{path}"


def as_(user: str) -> dict[str, str]:
    return {"X-User-Id": user}


def test_http_questions_next_submit_round_trip(client):
    c, spy = client
    q = c.get(url("/questions"), headers=as_("ana"))
    assert q.status_code == 200
    assert q.json()["first_comparison"]["id"] == "b"
    answers = [{"other_mark_id": "b", "preferred": "this"}]
    nxt = c.post(url("/next"), json={"answers": answers}, headers=as_("ana"))
    assert set(nxt.json()) == {"next_comparison"}
    assert nxt.json()["next_comparison"]["id"] == "a"
    answers.append({"other_mark_id": "a", "preferred": "other"})
    body = {"face": "loved", "answers": answers, "vibe_tags": ["quiet"], "note": ""}
    res = c.post(url(), json=body, headers=as_("ana"))
    assert res.status_code == 200, res.text
    data = res.json()
    assert (data["position"], data["total"], data["score"]) == (2, 4, 7.0)
    assert [i["position"] for i in data["list"]] == [1, 2, 3, 4]
    assert data["taste"]["summary"] == "Loves quiet coffee"
    assert spy.calls == [(MOVE, "ana")]
    assert c.post(url(), json=body, headers=as_("ana")).status_code == 409


def test_http_errors(client):
    c, _ = client
    body = {"face": "fine", "answers": [], "vibe_tags": [], "note": ""}
    assert c.post(url(), json=body, headers=as_("cal")).status_code == 403
    assert c.get(url("/questions"), headers=as_("dee")).status_code == 404
    assert c.post(url(), json=body, headers=as_("dee")).status_code == 404
    stale = {"answers": [{"other_mark_id": "c", "preferred": "this"}]}
    assert c.post(url("/next"), json=stale, headers=as_("ana")).status_code == 422
    bad_face = {**body, "face": "meh"}
    assert c.post(url(), json=bad_face, headers=as_("ana")).status_code == 422


def test_http_responses_carry_no_user_coordinates(client):
    c, _ = client
    q = c.get(url("/questions"), headers=as_("ana")).json()
    assert set(q["mark"]) >= {"lat", "lng"}  # Mark coordinates only
    assert "lat" not in str(q.get("faces"))
