"""Muse search (docs/MUSE_SEARCH.md): the planner, group place scores, and the
whole flow over HTTP with every lane wired."""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.core.clock import DemoClock
from app.core.config import settings
from app.core.gateways import SqlMarkGateway, SqlMoveGateway, SqlUserGateway
from app.domain.recommend import GroupPlace, rank_group_places
from app.lanes import muse as muse_lane
from app.lanes import surfaces as surfaces_lane
from app.main import create_app
from app.muse.agents.search_planner import check, heuristic
from app.muse.client import FakeMuseClient
from app.services import examples
from app.tables import Friendship, Mark, MarkRanking, MoveAudience, User, UserSettings
from tests.core.fakes import FixedClock, RecordingPublisher

API = "/api/v1"
T0 = datetime(2026, 11, 12, 15, 0, tzinfo=UTC)

# --- planner fallback (no model) ----------------------------------------------


@pytest.mark.parametrize(
    ("said", "action", "people", "category"),
    [
        ("tell Divy I want to go on a run", "move", ["Divy"], "fitness"),
        ("take me and Divyash to get coffee", "move", ["Divyash"], "coffee"),
        ("who wants to go on a run?", "who", [], "fitness"),
        ("where should me and Priya eat?", "where", ["Priya"], "food"),
        ("hmm", "clarify", [], None),
    ],
)
def test_heuristic_plans_the_examples(said, action, people, category) -> None:
    p = heuristic(said)
    assert (p.action, p.people, p.category) == (action, people, category)


def test_heuristic_keeps_activity_and_named_place() -> None:
    p = heuristic("Tell divy and tony that i want to get boba at Kumo Matcha")
    assert p.text == "get boba" and p.people == ["divy", "tony"]
    assert p.place == "Kumo Matcha" and not p.pick_place


def test_check_cleans_model_output() -> None:
    from app.muse.agents.search_planner import SearchPlan

    out = check(
        SearchPlan(
            action="move",
            text="Going On A Run.",
            category="sports",
            people=["me", " Divy "],
            place="",
            pick_place=True,
        )
    )
    assert out.text == "going on a run" and out.category is None
    assert out.people == ["Divy"] and out.place is None and out.pick_place


# --- group place scores --------------------------------------------------------


def test_group_places_favor_what_everyone_likes() -> None:
    loved_by_me_hated_by_you = GroupPlace("a", (9.5, 1.0))
    both_fine = GroupPlace("b", (7.0, 7.5))
    nobody_rated = GroupPlace("c", (None, None))
    ranked = rank_group_places([loved_by_me_hated_by_you, nobody_rated, both_fine])
    # least misery: a place one person hates sits below one nobody has tried
    assert [p.mark_id for p in ranked] == ["b", "c", "a"]


# --- HTTP, every lane wired -------------------------------------------------------

CAST = {
    "u_anish": ("Anish", "Anish Alle"),
    "u_priya": ("Priya", "Priya Rao"),
    "u_tony": ("Tony", "Tony Stark"),
    "u_diva": ("Div", "Div Patel"),
    "u_divb": ("Div", "Div Shah"),
    "u_stranger": ("Sam", "Sam Nobody"),
}
FRIENDS = ["u_priya", "u_tony", "u_diva", "u_divb"]
MARKS = [
    ("mk_kumo", "Kumo Matcha", "coffee"),
    ("mk_brew", "Brew Lab", "coffee"),
    ("mk_track", "Campus Track", "fitness"),
]


@pytest.fixture
def world(session: Session) -> Session:
    for uid, (first, name) in CAST.items():
        session.add(User(id=uid, name=name, first_name=first, created_at=T0))
        session.add(UserSettings(user_id=uid))
    for mid, name, cat in MARKS:
        session.add(Mark(id=mid, name=name, category=cat, lat=30.28, lng=-97.74))
    session.add_all(
        Friendship(user_a=min("u_anish", f), user_b=max("u_anish", f), since=T0)
        for f in FRIENDS
    )
    # Anish loves Kumo, Priya can't stand it; both like Brew Lab.
    for uid, mid, score in [
        ("u_anish", "mk_kumo", 9.5),
        ("u_priya", "mk_kumo", 2.0),
        ("u_anish", "mk_brew", 7.5),
        ("u_priya", "mk_brew", 8.0),
    ]:
        session.add(
            MarkRanking(
                user_id=uid, mark_id=mid, category="coffee", position=0, score=score
            )
        )
    session.commit()
    return session


def boot(engine: Engine, client: FakeMuseClient) -> Any:
    clock = DemoClock(FixedClock(T0))

    def registrar(container, hooks, scheduler) -> None:
        container.clock = clock
        container.time_control = clock
        container.events = RecordingPublisher()
        container.users = SqlUserGateway(engine, clock)
        container.moves = SqlMoveGateway(engine, clock, container.events, hooks)
        container.marks = SqlMarkGateway(engine, clock)
        surfaces_lane.register(container, hooks, scheduler, engine=engine)
        muse_lane.register(container, hooks, scheduler, engine=engine, client=client)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=(registrar,))
    app.dependency_overrides[db.get_session] = session_override
    return app


@pytest.fixture
def muse() -> FakeMuseClient:
    return FakeMuseClient({"muse_search": "garbage"})  # heuristic unless a test sets it


@pytest.fixture
def http(engine, world, muse, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    examples.release_all()
    with TestClient(boot(engine, muse)) as c:
        yield c
    examples.release_all()


ME = {"X-User-Id": "u_anish"}


def ask(http: TestClient, text: str, **extra: Any) -> dict:
    r = http.post(f"{API}/muse/search", json={"text": text, **extra}, headers=ME)
    assert r.status_code == 200, r.text
    return r.json()


def test_tell_someone_drafts_a_move_only_they_see(http, world, muse) -> None:
    muse.responses["muse_search"] = {
        "action": "move",
        "text": "going on a run",
        "category": "fitness",
        "people": ["Priya"],
        "place": "Campus Track",
        "pick_place": False,
        "message": "A run, just for Priya.",
    }
    res = ask(http, "tell Priya I want to go on a run at Campus Track")
    assert res["kind"] == "draft" and res["source"] == "muse"
    draft = res["draft"]
    assert draft["text"] == "going on a run" and draft["place"] == "Campus Track"
    assert draft["recipients"] == ["Priya Rao"]
    assert draft["audience"] == "Only Priya Rao will see this"

    posted = http.post(
        f"{API}/muse/search/confirm", json={"draft_id": draft["draft_id"]}, headers=ME
    )
    assert posted.status_code == 200, posted.text
    move_id = posted.json()["move_id"]
    again = http.post(
        f"{API}/muse/search/confirm", json={"draft_id": draft["draft_id"]}, headers=ME
    )
    assert again.json()["move_id"] == move_id  # posted exactly once
    world.expire_all()
    audience = world.exec(
        select(MoveAudience.user_id).where(MoveAudience.move_id == move_id)
    ).all()
    assert set(audience) == {"u_priya"}
    seen = http.get(f"{API}/moves/{move_id}", headers={"X-User-Id": "u_tony"})
    assert seen.status_code == 404  # Tony is not in the audience


def test_pick_place_uses_everyones_rankings(http) -> None:
    # Muse is down (garbage): the keyword planner picks pick_place for coffee.
    res = ask(http, "take me and Priya to get coffee")
    assert res["kind"] == "draft" and res["source"] == "heuristic"
    assert res["draft"]["place"] == "Brew Lab"  # not Kumo: Priya rated it 2
    assert res["draft"]["recipients"] == ["Priya Rao"]


def test_ambiguous_name_asks_then_uses_the_pick(http) -> None:
    res = ask(http, "tell Div I want to get coffee at Kumo Matcha")
    assert res["kind"] == "clarify" and res["clarify"]["field"] == "person"
    assert res["clarify"]["name"] == "Div"
    assert {o["user_id"] for o in res["clarify"]["options"]} == {"u_diva", "u_divb"}
    res = ask(
        http, "tell Div I want to get coffee at Kumo Matcha", picks={"Div": "u_divb"}
    )
    assert res["kind"] == "draft" and res["draft"]["recipients"] == ["Div Shah"]


def test_not_a_friend_gets_a_plain_answer(http) -> None:
    res = ask(http, "tell Sam I want to go on a run")
    assert res["kind"] == "answer" and "isn't one of your friends" in res["message"]


def test_where_lists_group_places_with_reasons(http) -> None:
    res = ask(http, "where should me and Priya get coffee?")
    assert res["kind"] == "places"
    names = [p["name"] for p in res["places"]]
    assert names[0] == "Brew Lab" and "Kumo Matcha" in names
    assert res["places"][0]["reason"] == "you loved it · Priya loved it"


def test_who_suggests_friends_then_drafts_to_them(http) -> None:
    res = ask(http, "who wants to go on a run?")
    assert res["kind"] == "people" and res["people"]
    ids = [p["user_id"] for p in res["people"]][:2]
    r = http.post(
        f"{API}/muse/search/draft",
        json={"text": res["text"], "user_ids": ids, "mark_id": "mk_track"},
        headers=ME,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "draft" and body["draft"]["place"] == "Campus Track"
    assert len(body["draft"]["recipients"]) == len(ids)


def test_search_still_asks_muse_in_deterministic_mode(
    engine, world, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    monkeypatch.setattr(settings, "MUSE_DETERMINISTIC", True)
    muse = FakeMuseClient(
        {
            "muse_search": {
                "action": "where",
                "category": "coffee",
                "people": [],
                "message": "Your top coffee spots.",
            }
        }
    )
    examples.release_all()
    with TestClient(boot(engine, muse)) as http:
        res = ask(http, "what are my top coffee spots")
    examples.release_all()
    assert res["source"] == "muse" and res["kind"] == "places"
    assert [p["name"] for p in res["places"]][:2] == ["Kumo Matcha", "Brew Lab"]
    assert len(muse.calls) == 1


def test_expired_draft_is_409(http) -> None:
    r = http.post(f"{API}/muse/search/confirm", json={"draft_id": "nope"}, headers=ME)
    assert r.status_code == 409
