"""S9: glasses command and confirm (PROMPTS.md acceptance 1 to 7)."""

import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.routes.glasses import current_user_id
from app.main import create_app
from app.ports import Intent
from app.services import glasses
from app.services.glasses import (
    DraftExpired,
    DraftStore,
    GlassesService,
    clean,
    fallback_intent,
    match_named,
    usual_mark_id,
)
from tests.surfaces.fakes import (
    T0,
    FakeClock,
    FakeMarks,
    FakeMoves,
    FakeMuse,
    FakePlaces,
    mark,
)

LOC = (30.2812, -97.7421)


class World:
    def __init__(self, places: FakePlaces | None = None, demo: bool = False) -> None:
        self.clock = FakeClock()
        self.muse = FakeMuse()
        self.marks = FakeMarks(mark())
        self.moves = FakeMoves()
        self.drafts = DraftStore(self.clock.now)
        self.service = GlassesService(
            clock=self.clock,
            muse=self.muse,
            marks=self.marks,
            moves=self.moves,
            drafts=self.drafts,
            lock=asyncio.Lock(),
            places=places,
            demo_mode=lambda: demo,
        )


@pytest.fixture
def world() -> World:
    return World()


def run(coro):
    return asyncio.run(coro)


def test_command_posts_nothing_and_returns_draft(world: World) -> None:
    out = run(world.service.command("ana", "start a move getting boba", *LOC))
    assert out.understood and out.draft_id
    assert out.place == "Kumo"
    assert "Say confirm" in out.spoken
    assert world.moves.created == []


def test_confirm_creates_one_glasses_move_and_is_idempotent(world: World) -> None:
    cmd = run(world.service.command("ana", "start a move getting boba", *LOC))
    first = run(world.service.confirm("ana", cmd.draft_id))
    second = run(world.service.confirm("ana", cmd.draft_id))
    assert first.move_id == second.move_id
    assert len(world.moves.created) == 1
    creator, draft = world.moves.created[0]
    assert creator == "ana" and draft.origin == "glasses"
    assert draft.mark_id == "kumo" and draft.text == "getting boba"
    assert world.muse.notified == [first.move_id]


def test_concurrent_confirms_post_once(world: World) -> None:
    run(world.service.command("ana", "start a move boba", *LOC))

    async def both():
        return await asyncio.gather(
            world.service.confirm("ana"), world.service.confirm("ana")
        )

    a, b = run(both())
    assert a.move_id == b.move_id and len(world.moves.created) == 1


def test_confirm_without_draft_is_conflict(world: World) -> None:
    with pytest.raises(DraftExpired):
        run(world.service.confirm("ana"))
    assert world.moves.created == []


def test_confirm_after_expiry_is_conflict(world: World) -> None:
    run(world.service.command("ana", "start a move boba", *LOC))
    world.clock.advance(minutes=5, seconds=1)
    with pytest.raises(DraftExpired):
        run(world.service.confirm("ana"))
    assert world.moves.created == []


def test_draft_alive_just_before_ttl(world: World) -> None:
    run(world.service.command("ana", "start a move boba", *LOC))
    world.clock.advance(minutes=4, seconds=59)
    assert run(world.service.confirm("ana")).move_id


def test_other_user_cannot_confirm_my_draft(world: World) -> None:
    cmd = run(world.service.command("ana", "start a move boba", *LOC))
    with pytest.raises(DraftExpired):
        run(world.service.confirm("bo", cmd.draft_id))
    with pytest.raises(DraftExpired):
        run(world.service.confirm("bo"))
    assert world.moves.created == []


def test_wrong_draft_id_is_conflict(world: World) -> None:
    run(world.service.command("ana", "start a move boba", *LOC))
    with pytest.raises(DraftExpired):
        run(world.service.confirm("ana", "not-the-draft"))


def test_new_command_replaces_old_draft(world: World) -> None:
    old = run(world.service.command("ana", "start a move boba", *LOC))
    new = run(world.service.command("ana", "start a move pizza", *LOC))
    with pytest.raises(DraftExpired):
        run(world.service.confirm("ana", old.draft_id))
    assert run(world.service.confirm("ana", new.draft_id)).move_id


def test_coordinates_only_feed_nearest_and_never_leak(world: World) -> None:
    out = run(world.service.command("ana", "start a move boba", *LOC))
    assert world.marks.nearest_calls == [(*LOC, 1)]
    assert world.muse.compose_calls[0]["coarse"] is None
    blob = repr(out) + repr(world.drafts._items)
    assert "30.2812" not in blob and "97.7421" not in blob


def test_no_place_anywhere_asks_where_and_holds_no_draft(world: World) -> None:
    out = run(world.service.command("ana", "start a move boba"))
    assert out.understood and out.needs_place and out.draft_id is None
    assert out.place is None and "Where at?" in out.spoken
    assert world.marks.nearest_calls == []
    assert len(world.drafts) == 0
    with pytest.raises(DraftExpired):
        run(world.service.confirm("ana"))
    assert world.moves.created == []


def _bare(places: FakePlaces, demo: bool = False) -> World:
    return World(places=places, demo=demo)


def test_named_place_is_used_without_coords() -> None:
    w = _bare(FakePlaces(named=mark("saku", "Saku")))
    out = run(w.service.command("ana", "start a move boba at saku"))
    assert out.place == "Saku" and out.place_source == "named"
    run(w.service.confirm("ana", out.draft_id))
    assert w.moves.created[0][1].mark_id == "saku"


def test_usual_place_when_nothing_named() -> None:
    places = FakePlaces(usual=mark("hs", "HS Coffee"))
    w = _bare(places)
    out = run(w.service.command("ana", "start a move boba"))
    assert out.place_source == "usual" and "your usual spot" in out.spoken
    assert places.calls == ["named", "usual"]


def test_named_beats_usual_beats_demo() -> None:
    places = FakePlaces(named=mark("n", "N"), usual=mark("u", "U"), demo=mark("d", "D"))
    w = _bare(places, demo=True)
    assert run(w.service.command("ana", "start a move x")).place_source == "named"
    places.named = None
    assert run(w.service.command("ana", "start a move x")).place_source == "usual"
    places.usual = None
    assert run(w.service.command("ana", "start a move x")).place_source == "demo"


def test_demo_mark_only_in_demo_mode() -> None:
    places = FakePlaces(demo=mark("kumo", "Kumo"))
    out = run(_bare(places).service.command("ana", "start a move boba"))
    assert out.needs_place and "demo" not in places.calls
    out = run(_bare(places, demo=True).service.command("ana", "start a move boba"))
    assert out.place == "Kumo" and out.place_source == "demo"


def test_demo_mode_never_leaves_confirm_without_place() -> None:
    w = _bare(FakePlaces(demo=mark("kumo", "Kumo")), demo=True)
    out = run(w.service.command("ana", "start a move boba"))
    posted = run(w.service.confirm("ana", out.draft_id))
    assert posted.move_id and w.moves.created[0][1].mark_id == "kumo"


def test_demo_mode_without_demo_mark_still_asks() -> None:
    out = run(_bare(FakePlaces(), demo=True).service.command("ana", "start a move x"))
    assert out.needs_place and out.draft_id is None


def test_muse_place_and_nearby_come_first() -> None:
    places = FakePlaces(named=mark("n", "N"), demo=mark("d", "D"))
    w = _bare(places, demo=True)
    w.marks.marks["kumo"] = mark()
    out = run(w.service.command("ana", "start a move boba", *LOC))
    assert out.place_source == "nearby" and places.calls == []


def test_muse_down_uses_fallback_parser(world: World) -> None:
    world.muse.down = True
    out = run(world.service.command("ana", "Start a MOVE, getting tacos", *LOC))
    assert out.understood and out.text == "getting tacos"
    assert run(world.service.confirm("ana")).move_id


def test_muse_no_intent_still_tries_fallback(world: World) -> None:
    world.muse.intent = Intent(intent="none", text="start a move boba")
    assert run(world.service.command("ana", "start a move boba", *LOC)).understood


def test_unrelated_utterance_is_friendly_noop(world: World) -> None:
    world.muse.intent = Intent(intent="none", text="what time is it")
    out = run(world.service.command("ana", "what time is it", *LOC))
    assert not out.understood and out.draft_id is None
    assert len(world.drafts) == 0
    assert world.moves.created == []


def test_muse_down_unrelated_is_noop(world: World) -> None:
    world.muse.down = True
    assert not run(world.service.command("ana", "play some music", *LOC)).understood


def test_start_with_no_body_is_noop(world: World) -> None:
    world.muse.down = True
    assert not run(world.service.command("ana", "start a move", *LOC)).understood


def test_untrusted_text_is_cleaned_and_truncated(world: World) -> None:
    world.muse.intent = Intent(
        intent="start_move", text="<script>x</script>\nboba\x07 " + "z" * 500
    )
    out = run(world.service.command("ana", "start a move", *LOC))
    assert "<" not in out.spoken and "\n" not in out.spoken
    assert "\x07" not in out.spoken
    assert len(out.spoken) < 200


def test_clean_and_fallback_helpers() -> None:
    assert clean("  a \n\t b  ", 10) == "a b"
    assert clean("x" * 20, 5).endswith("…") and len(clean("x" * 20, 5)) == 5
    assert fallback_intent("Hey Meta, start a move: boba").text == "boba"
    assert fallback_intent("hello").intent == "none"


def test_store_purge_drops_expired() -> None:
    clock = FakeClock()
    store = DraftStore(clock.now)
    store.put("ana", run(FakeMuse().compose_move("ana", seed_text="x")))
    clock.advance(minutes=6)
    assert store.purge() == 1 and len(store) == 0


# -- HTTP round trip ----------------------------------------------------------


@pytest.fixture
def client(world: World):
    app = create_app(lanes=())
    app.dependency_overrides[current_user_id] = lambda: "ana"
    with TestClient(app) as http:
        c = app.state.container
        c.clock, c.muse, c.marks, c.moves = (
            world.clock,
            world.muse,
            world.marks,
            world.moves,
        )
        glasses.install(world.drafts)
        yield http


def test_http_round_trip(client: TestClient, world: World) -> None:
    res = client.post(
        "/api/v1/glasses/command",
        json={"utterance": "start a move getting boba", "lat": LOC[0], "lng": LOC[1]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["place"] == "Kumo" and "lat" not in body and "lng" not in body
    ok = client.post("/api/v1/glasses/confirm", json={"draft_id": body["draft_id"]})
    again = client.post("/api/v1/glasses/confirm", json={})
    assert ok.status_code == 200 and again.json()["move_id"] == ok.json()["move_id"]
    assert len(world.moves.created) == 1


def test_http_confirm_without_draft_is_409(client: TestClient) -> None:
    res = client.post("/api/v1/glasses/confirm", json={})
    assert res.status_code == 409 and "again" in res.json()["detail"]


def test_http_lone_coordinate_is_422(client: TestClient) -> None:
    res = client.post(
        "/api/v1/glasses/command", json={"utterance": "start a move x", "lat": 1.0}
    )
    assert res.status_code == 422


def test_http_unknown_user_is_401() -> None:
    with TestClient(create_app(lanes=())) as http:
        res = http.post("/api/v1/glasses/command", json={"utterance": "hi"})
    assert res.status_code == 401


def test_ttl_constant_is_five_minutes() -> None:
    assert glasses.DRAFT_TTL == timedelta(minutes=5)


# -- place helpers --------------------------------------------------------------

NAMES = [("kumo", "Kumo Matcha"), ("saku", "Saku Sushi"), ("hs", "HS Coffee")]


def test_match_named_full_name_and_first_word() -> None:
    assert match_named("boba at Kumo Matcha tonight", NAMES) == "kumo"
    assert match_named("heading to kumo", NAMES) == "kumo"
    assert match_named("getting boba", NAMES) is None


def test_match_named_ambiguity_returns_none() -> None:
    twins = [("a", "Kumo Matcha"), ("b", "Kumo Express")]
    assert match_named("at kumo", twins) is None
    assert match_named("at kumo matcha", twins) == "a"


def test_match_named_ignores_short_first_words() -> None:
    assert match_named("at hs", NAMES) is None


def test_usual_mark_id_most_visited_then_recent_then_saved() -> None:
    d = [T0 + timedelta(days=n) for n in range(5)]
    visits = [("a", d[0]), ("a", d[1]), ("b", d[4])]
    assert usual_mark_id(visits, []) == "a"
    assert usual_mark_id([("a", d[0]), ("b", d[3])], []) == "b"
    assert usual_mark_id([], [("s1", d[0]), ("s2", d[2])]) == "s2"
    assert usual_mark_id([], []) is None


# -- SQL place finder (reads core tables) ---------------------------------------


def _seed_places(session) -> None:
    from app.tables import Mark, Move, MoveParticipant, SavedMark, User

    session.add_all(
        [User(id=u, name=u, first_name=u, created_at=T0) for u in ("ana", "bo")]
    )
    for mid, name in (("kumo", "Kumo Matcha"), ("hs", "HS Coffee"), ("saku", "Saku")):
        session.add(Mark(id=mid, name=name, category="coffee", lat=1.0, lng=2.0))
    session.commit()
    for i, mid in enumerate(("hs", "hs", "kumo")):
        session.add(
            Move(
                id=f"m{i}",
                creator_id="bo",
                mark_id=mid,
                text="x",
                category="coffee",
                starts_at=T0,
                created_at=T0,
            )
        )
        session.add(
            MoveParticipant(
                move_id=f"m{i}",
                user_id="ana",
                status="going",
                joined_via="tap",
                joined_at=T0 + timedelta(hours=i),
            )
        )
    session.add(SavedMark(user_id="bo", mark_id="saku", saved_at=T0))
    session.commit()


def test_sql_place_finder(engine, session) -> None:
    from app.repositories.glasses_places import SqlPlaceFinder

    _seed_places(session)
    finder = SqlPlaceFinder(engine, demo_mark_id="kumo")
    named = finder.named_in("boba at saku")
    assert named is not None and named.id == "saku"
    assert finder.named_in("just boba") is None
    usual = finder.usual_for("ana")
    assert usual is not None and usual.id == "hs"  # visited twice
    saved_only = finder.usual_for("bo")
    assert saved_only is not None and saved_only.id == "saku"
    assert finder.usual_for("nobody") is None
    demo = finder.demo_mark()
    assert demo is not None and demo.name == "Kumo Matcha"
    assert SqlPlaceFinder(engine, "missing").demo_mark() is None
