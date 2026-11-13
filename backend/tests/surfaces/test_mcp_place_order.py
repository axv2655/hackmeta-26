"""MCP place order: the `place` argument, a Mark named in the text, the user's
usual Mark, the demo Mark in DEMO_MODE. Coordinates and Muse's own pick never
decide the place, and nothing generic is ever created."""

import asyncio

from app.services.glasses import GlassesService
from tests.surfaces.fakes import FakeCreator, FakePlaces, mark
from tests.surfaces.test_mcp_tools import Rig, person

MENLO = (37.4849, -122.1477)  # Muse's default coordinates, not the user's
KUMO = mark("mk_kumo_matcha", "Kumo Matcha")
HS = mark("hs", "HS Coffee")
SAKU = mark("saku", "Saku Sushi")


def run(coro):
    return asyncio.run(coro)


def rig_with(places: FakePlaces, demo: bool = False) -> tuple[Rig, FakeCreator]:
    rig = Rig(person("bo", "Bo Lee"))
    creator = FakeCreator()
    rig.tools.glasses = GlassesService(
        clock=rig.clock,
        muse=rig.muse,
        marks=rig.marks,
        moves=rig.moves,
        drafts=rig.drafts,
        lock=asyncio.Lock(),
        places=places,
        demo_mode=lambda: demo,
        creator=creator,
    )
    rig.named["saku"] = SAKU
    return rig, creator


def test_1_place_argument_wins() -> None:
    places = FakePlaces(named=KUMO, usual=HS, demo=KUMO)
    rig, _ = rig_with(places, demo=True)
    out = run(rig.tools.draft_move("boba", None, "Saku"))
    assert out["status"] == "draft" and out["place"] == "Saku Sushi"
    run(rig.tools.confirm_move(out["draft_id"], "r"))
    assert rig.moves.created[0][1].mark_id == "saku"


def test_1_place_named_in_the_text() -> None:
    rig, _ = rig_with(FakePlaces(named=KUMO, usual=HS))
    out = run(rig.tools.draft_move("getting matcha at Kumo"))
    assert out["place"] == "Kumo Matcha" and out["status"] == "draft"


def test_1_unknown_place_argument_is_ignored_and_the_order_continues() -> None:
    rig, _ = rig_with(FakePlaces(usual=HS))
    out = run(rig.tools.draft_move("boba", None, "Narnia Cafe"))
    assert out["status"] == "draft" and out["place"] == "HS Coffee"
    nothing, _ = rig_with(FakePlaces())
    asked = run(nothing.tools.draft_move("boba", None, "Narnia Cafe"))
    assert asked["status"] == "needs_place" and "Where at?" in asked["spoken"]


def test_2_usual_mark_when_nothing_is_named() -> None:
    rig, _ = rig_with(FakePlaces(usual=HS, demo=KUMO))
    out = run(rig.tools.draft_move("boba"))
    assert out["place"] == "HS Coffee" and "usual spot" in out["spoken"]


def test_text_named_beats_usual() -> None:
    places = FakePlaces(named=KUMO, usual=HS)
    rig, _ = rig_with(places)
    assert run(rig.tools.draft_move("matcha at kumo"))["place"] == "Kumo Matcha"
    assert places.calls[:1] == ["named"]


def test_3_demo_mark_only_in_demo_mode() -> None:
    rig, _ = rig_with(FakePlaces(demo=KUMO), demo=True)
    out = run(rig.tools.draft_move("boba"))
    assert out["status"] == "draft" and out["place"] == "Kumo Matcha"
    run(rig.tools.confirm_move(out["draft_id"], "r"))
    assert rig.moves.created[0][1].mark_id == "mk_kumo_matcha"


def test_nothing_matches_outside_demo_mode_asks_where_with_no_draft() -> None:
    places = FakePlaces(demo=KUMO)  # a demo Mark exists but DEMO_MODE is off
    rig, _ = rig_with(places, demo=False)
    out = run(rig.tools.draft_move("boba"))
    assert out["status"] == "needs_place" and out["question"] == "Where at?"
    assert "Where at?" in out["spoken"] and "draft_id" not in out
    assert len(rig.drafts) == 0 and "demo" not in places.calls


def test_coordinates_present_but_ignored() -> None:
    places = FakePlaces(usual=HS)
    rig, creator = rig_with(places)
    out = run(rig.tools.draft_move("boba", None, None, *MENLO))
    assert out["place"] == "HS Coffee"  # not the Mark nearest Menlo Park
    assert rig.marks.nearest_calls == []
    assert creator.created == []


def test_coordinates_never_beat_a_named_place_or_make_a_spot() -> None:
    rig, creator = rig_with(FakePlaces(named=KUMO))
    out = run(rig.tools.draft_move("matcha at kumo", None, None, *MENLO))
    assert out["place"] == "Kumo Matcha" and rig.marks.nearest_calls == []
    far = run(rig.tools.draft_move("street fair", None, None, 10.0, 20.0))
    assert far["status"] == "draft"  # falls to the named Mark, never a new spot
    assert creator.created == []


def test_muses_own_place_pick_is_not_used() -> None:
    rig, _ = rig_with(FakePlaces())
    rig.muse.choose = "kumo"  # Muse would put it at Kumo on its own
    out = run(rig.tools.draft_move("boba"))
    assert out["status"] == "needs_place" and len(rig.drafts) == 0


def test_muses_pick_loses_to_the_users_usual_mark() -> None:
    rig, _ = rig_with(FakePlaces(usual=HS))
    rig.muse.choose = "kumo"
    assert run(rig.tools.draft_move("boba"))["place"] == "HS Coffee"


def test_never_resolves_to_a_city_level_place() -> None:
    rig, creator = rig_with(FakePlaces())
    out = run(rig.tools.draft_move("boba", None, "Menlo Park", *MENLO))
    assert out["status"] == "needs_place"
    assert creator.created == [] and rig.moves.created == []
