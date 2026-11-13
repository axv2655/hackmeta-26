"""Moves MCP tools: drafts write nothing, writes are idempotent, names resolve
to friends only."""

import asyncio
from collections.abc import Iterable

import pytest

from app.container import Container
from app.ports import NotifyPickOut, ParticipantSnapshot
from app.services.glasses import DraftStore, GlassesService
from app.services.mcp_tools import (
    IdempotencyCache,
    MovesTools,
    Person,
    bounded,
)
from tests.surfaces.fakes import (
    T0,
    FakeClock,
    FakeMarks,
    FakeMoveGateway,
    FakeMuse,
    FakeProximity,
    mark,
)

ME = "anish"
LOC = (30.2812, -97.7421)


def person(uid: str, name: str, friend: bool = True, username: str | None = None):
    return Person(uid, name, name.split()[0], username or uid, friend)


class FakePeople:
    def __init__(self, *people: Person, opted_in: Iterable[str] = ()) -> None:
        self.people = list(people)
        self.opted_in = set(opted_in)

    def search(self, me: str, query: str) -> list[Person]:
        q = query.lower().lstrip("@")
        return [
            p
            for p in self.people
            if q in p.name.lower() or (p.username or "").lower().startswith(q)
        ]

    def names(self, user_ids: Iterable[str]) -> dict[str, str]:
        return {p.id: p.name for p in self.people if p.id in set(user_ids)}

    def opted_in_friends(self, me: str, user_ids: Iterable[str]) -> list[Person]:
        ids = set(user_ids)
        return [
            p
            for p in self.people
            if p.id in ids and p.is_friend and p.id in self.opted_in
        ]


class Rig:
    def __init__(self, *people: Person, opted_in: Iterable[str] = ()) -> None:
        self.clock = FakeClock()
        self.muse = FakeMuse()
        self.moves = FakeMoveGateway()
        self.marks = FakeMarks(mark())
        self.proximity = FakeProximity()
        self.drafts = DraftStore(self.clock.now)
        self.people = FakePeople(*people, opted_in=opted_in)
        self.named: dict[str, object] = {"kumo": mark()}
        container = Container(
            clock=self.clock,
            muse=self.muse,
            marks=self.marks,
            moves=self.moves,
            proximity=self.proximity,
        )
        service = GlassesService(
            clock=self.clock,
            muse=self.muse,
            marks=self.marks,
            moves=self.moves,
            drafts=self.drafts,
            lock=asyncio.Lock(),
        )
        self.tools = MovesTools(
            container=container,
            user_id=ME,
            people=self.people,
            glasses_service=service,
            place_by_name=lambda name: self.named.get(name.strip().lower()),  # type: ignore[arg-type]
            idempotency=IdempotencyCache(),
        )


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def rig() -> Rig:
    return Rig(
        person("bo", "Bo Lee"),
        person("cy", "Cy Park"),
        person("sam1", "Sam Rivera", username="sam_r"),
        person("sam2", "Sam Okafor", username="sam_o"),
        person("stranger", "Stan Ger", friend=False),
        opted_in={"bo", "cy"},
    )


# -- draft_move -----------------------------------------------------------------


def test_draft_writes_nothing_and_returns_draft(rig: Rig) -> None:
    rig.muse.picks = (NotifyPickOut("bo", "Bo, boba?", "likes boba"),)
    out = run(rig.tools.draft_move("getting boba", ["Bo"], "Kumo"))
    assert out["status"] == "draft" and out["draft_id"]
    assert out["place"] == "Kumo" and out["text"] == "getting boba"
    assert out["recipients"] == ["Bo Lee"]
    assert out["nudges"] == [{"name": "Bo Lee", "line": "Bo, boba?"}]
    assert "confirm" in out["spoken"].lower()
    assert rig.moves.created == [] and rig.moves.moves == {}
    assert rig.muse.notified == []


def test_draft_recipients_flow_into_the_posted_move(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Bo", "@cy"], "Kumo"))
    run(rig.tools.confirm_move(out["draft_id"], "r1"))
    _, create = rig.moves.created[0]
    assert set(create.user_ids) == {"bo", "cy"} and create.origin == "glasses"


def test_draft_uses_coordinates_without_echoing_them(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", None, None, *LOC))
    assert out["status"] == "draft" and out["place"] == "Kumo"
    assert rig.marks.nearest_calls == [(*LOC, 1)]
    blob = repr(out) + repr(rig.drafts._items)
    assert "30.2812" not in blob and "97.7421" not in blob


def test_draft_without_any_place_asks_where(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba"))
    assert out["status"] == "needs_place" and out["question"] == "Where at?"
    assert len(rig.drafts) == 0


def test_unknown_place_is_a_question_not_a_guess(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", None, "Narnia Cafe"))
    assert out["status"] == "needs_clarification"
    assert out["problems"][0]["problem"] == "place_not_found"
    assert len(rig.drafts) == 0


def test_ambiguous_name_returns_candidates_and_no_draft(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Sam"], "Kumo"))
    assert out["status"] == "needs_clarification"
    problem = out["problems"][0]
    assert problem["problem"] == "ambiguous"
    assert {c["name"] for c in problem["candidates"]} == {
        "Sam Rivera",
        "Sam Okafor",
    }
    assert len(rig.drafts) == 0 and rig.moves.created == []


def test_full_name_or_handle_disambiguates(rig: Rig) -> None:
    for who in ("Sam Okafor", "@sam_o"):
        out = run(rig.tools.draft_move("boba", [who], "Kumo"))
        assert out["status"] == "draft" and out["recipients"] == ["Sam Okafor"]


def test_non_friend_is_rejected(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Stan"], "Kumo"))
    assert out["status"] == "needs_clarification"
    assert out["problems"][0]["problem"] == "not_a_friend"
    assert len(rig.drafts) == 0


def test_unknown_person_is_not_found(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Zed"], "Kumo"))
    assert out["problems"][0]["problem"] == "not_found"


def test_one_bad_name_blocks_the_whole_draft(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Bo", "Stan"], "Kumo"))
    assert out["status"] == "needs_clarification" and len(rig.drafts) == 0


def test_blank_text_and_lone_coordinate_are_invalid(rig: Rig) -> None:
    assert run(rig.tools.draft_move("   "))["status"] == "invalid"
    assert run(rig.tools.draft_move("boba", None, None, 1.0))["status"] == "invalid"


# -- confirm_move ---------------------------------------------------------------


def test_confirm_posts_once_per_request_id(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", ["Bo"], "Kumo"))
    first = run(rig.tools.confirm_move(out["draft_id"], "req-1"))
    again = run(rig.tools.confirm_move(out["draft_id"], "req-1"))
    other_id = run(rig.tools.confirm_move(out["draft_id"], "req-2"))
    assert first["status"] == "posted"
    assert again == first
    assert other_id["move_id"] == first["move_id"]
    assert len(rig.moves.created) == 1


def test_confirm_expired_draft_tells_the_model_to_redo(rig: Rig) -> None:
    out = run(rig.tools.draft_move("boba", None, "Kumo"))
    rig.clock.advance(minutes=6)
    res = run(rig.tools.confirm_move(out["draft_id"], "r"))
    assert res["status"] == "expired" and "draft_move" in res["message"]
    assert rig.moves.created == []


def test_confirm_unknown_draft_is_expired(rig: Rig) -> None:
    assert run(rig.tools.confirm_move("nope", "r"))["status"] == "expired"


# -- share_move -----------------------------------------------------------------


def test_share_nudges_audience_friends_once(rig: Rig) -> None:
    rig.moves.add("m1", ME, audience=("bo", "cy"))
    first = run(rig.tools.share_move("m1", ["Bo"], "s1"))
    again = run(rig.tools.share_move("m1", ["Bo"], "s1"))
    assert first["status"] == "shared" and first["nudged"] == ["Bo Lee"]
    assert again == first
    assert rig.muse.notify_calls == [("m1", {"bo"}, {"cy"})]


def test_share_skips_friends_outside_the_audience(rig: Rig) -> None:
    rig.moves.add("m1", ME, audience=("bo",))
    out = run(rig.tools.share_move("m1", ["Bo", "Cy"], "s1"))
    assert out["nudged"] == ["Bo Lee"]
    assert [s["name"] for s in out["skipped"]] == ["Cy Park"]


def test_share_to_a_non_friend_or_ambiguous_name_is_a_question(rig: Rig) -> None:
    rig.moves.add("m1", ME, audience=("bo",))
    assert run(rig.tools.share_move("m1", ["Stan"], "a"))["status"] == (
        "needs_clarification"
    )
    assert run(rig.tools.share_move("m1", ["Sam"], "b"))["problems"][0]["problem"] == (
        "ambiguous"
    )
    assert rig.muse.notify_calls == []


def test_share_requires_a_live_move_the_user_is_in(rig: Rig) -> None:
    rig.moves.add("theirs", "bo", audience=(ME,), participants=())
    rig.moves.add("old", ME, status="ended")
    for move_id in ("theirs-not-joined-missing", "old"):
        assert run(rig.tools.share_move(move_id, ["Bo"], move_id))["status"] == (
            "not_available"
        )


# -- pull_up ----------------------------------------------------------------------


def test_pull_up_joins_once(rig: Rig) -> None:
    rig.moves.add("m1", "bo", audience=(ME,))
    first = run(rig.tools.pull_up("m1", "p1"))
    same = run(rig.tools.pull_up("m1", "p1"))
    new_id = run(rig.tools.pull_up("m1", "p2"))
    assert first["status"] == "going" and same == first
    assert new_id["status"] == "already_going"
    assert rig.moves.joined == [("m1", ME)]


def test_pull_up_needs_a_visible_live_move(rig: Rig) -> None:
    rig.moves.add("hidden", "bo", audience=("cy",))
    rig.moves.add("done", "bo", audience=(ME,), status="ended")
    for move_id in ("hidden", "done", "missing"):
        assert run(rig.tools.pull_up(move_id, move_id))["status"] == "not_available"
    assert rig.moves.joined == []


def test_pull_up_after_leaving_is_not_undone(rig: Rig) -> None:
    left = ParticipantSnapshot(ME, "left", "tap", T0, left_at=T0)
    rig.moves.add("m1", "bo", audience=(ME,), participants=(left,))
    assert run(rig.tools.pull_up("m1", "p"))["status"] == "left"
    assert rig.moves.joined == []


def test_pull_up_failure_is_reported_not_raised(rig: Rig) -> None:
    rig.moves.add("m1", "bo", audience=(ME,))

    async def boom(*args, **kwargs):
        raise RuntimeError("db down")

    rig.moves.add_participant = boom  # type: ignore[method-assign]
    assert run(rig.tools.pull_up("m1", "p"))["status"] == "failed"


# -- friends_nearby / get_my_active_move ------------------------------------------


def test_friends_nearby_only_opted_in_friends(rig: Rig) -> None:
    rig.proximity.together = frozenset({"bo", "cy", "stranger", "sam1"})
    rig.moves.add(
        "m1",
        "bo",
        audience=(ME,),
        participants=(ParticipantSnapshot("bo", "there", "creator", T0),),
    )
    rig.people.opted_in = {"bo"}  # cy is a friend but opted out
    out = rig.tools.friends_nearby()
    assert out["count"] == 1 and out["friends"] == ["Bo"] and out["place"] == "Kumo"
    assert not {"lat", "lng", "latitude", "longitude"} & set(out)


def test_friends_nearby_empty_when_nobody_is_with_you(rig: Rig) -> None:
    out = rig.tools.friends_nearby()
    assert out == {"status": "ok", "count": 0, "friends": [], "place": None}


def test_get_my_active_move_reads_without_writing(rig: Rig) -> None:
    assert rig.tools.get_my_active_move() == {"status": "ok", "active": False}
    rig.moves.add("m1", ME, audience=("bo",))
    out = rig.tools.get_my_active_move()
    assert out["active"] and out["move"]["move_id"] == "m1"
    assert out["move"]["you_are"] == "creator" and out["move"]["place"] == "Kumo"
    assert rig.moves.created == [] and rig.moves.joined == []


def test_get_my_active_move_for_a_joiner(rig: Rig) -> None:
    mine = ParticipantSnapshot(ME, "going", "tap", T0)
    rig.moves.add("m1", "bo", audience=(ME,), participants=(mine,))
    assert rig.tools.get_my_active_move()["move"]["you_are"] == "going"


# -- time budget ------------------------------------------------------------------


def test_bounded_cuts_a_slow_tool_and_points_to_the_read_tool() -> None:
    async def slow():
        await asyncio.sleep(5)

    out = run(bounded(slow(), timeout_s=0.05))
    assert out["status"] == "timeout" and "get_my_active_move" in out["message"]


def test_idempotency_cache_is_bounded() -> None:
    cache = IdempotencyCache(keep=2)
    for n in range(3):
        cache.put(("u", "t", str(n)), {"n": n})
    assert cache.get(("u", "t", "0")) is None
    assert cache.get(("u", "t", "2")) == {"n": 2}


# -- SQL people directory (reads core tables) ---------------------------------------


def test_sql_people_directory_friends_and_opt_in(engine, session) -> None:
    from app.ports_null import NullNotifier
    from app.repositories.mcp_people import SqlPeopleDirectory
    from app.tables import Friendship, User, UserSettings

    users = [
        User(id=u, name=n, first_name=n.split()[0], created_at=T0)
        for u, n in (
            ("anish", "Anish Alle"),
            ("bo", "Bo Lee"),
            ("cy", "Cy Park"),
            ("dee", "Dee Ng"),
        )
    ]
    session.add_all(users)
    session.commit()
    session.add_all(
        [
            Friendship(user_a="anish", user_b="bo", since=T0),
            Friendship(user_a="anish", user_b="cy", since=T0),
            UserSettings(user_id="bo", ble_opt_in=True),
            UserSettings(user_id="cy", ble_opt_in=False),
            UserSettings(user_id="dee", ble_opt_in=True),
        ]
    )
    session.commit()
    directory = SqlPeopleDirectory(engine, FakeClock(), NullNotifier())

    found = {p.id: p.is_friend for p in directory.search("anish", "e")}
    assert found.get("bo") is True and found.get("dee") is False
    assert "anish" not in found
    assert directory.names(["bo", "dee", "nobody"]) == {"bo": "Bo Lee", "dee": "Dee Ng"}
    opted = directory.opted_in_friends("anish", ["bo", "cy", "dee", "anish"])
    assert [p.id for p in opted] == ["bo"]  # cy opted out, dee is not a friend
    assert directory.opted_in_friends("anish", []) == []
