"""Events with no Mark on the map: with coordinates, the Move goes to a new spot
that is created only when confirmed."""

import asyncio

import pytest

from app.services.glasses import (
    DraftExpired,
    DraftStore,
    GlassesService,
    PlaceFailed,
    distance_m,
)
from tests.surfaces.fakes import (
    FakeClock,
    FakeCreator,
    FakeMarks,
    FakeMoveGateway,
    FakeMuse,
    mark,
)
from tests.surfaces.test_mcp_tools import Rig, person

NEAR = (30.2802, -97.7401)  # about 24 m from the fake Mark at 30.28, -97.74
FAR = (30.3012, -97.7021)  # a few km away
ROUND_FAR = (30.301, -97.702)
HOUSE = "Maya house party"


class World:
    def __init__(self) -> None:
        self.clock = FakeClock()
        self.muse = FakeMuse()
        self.marks = FakeMarks(mark())
        self.moves = FakeMoveGateway()
        self.drafts = DraftStore(self.clock.now)
        self.creator = FakeCreator()
        self.service = GlassesService(
            clock=self.clock,
            muse=self.muse,
            marks=self.marks,
            moves=self.moves,
            drafts=self.drafts,
            lock=asyncio.Lock(),
            creator=self.creator,
        )


def run(coro):
    return asyncio.run(coro)


def test_distance_m_is_in_metres() -> None:
    assert distance_m(30.28, -97.74, 30.28, -97.74) == 0
    assert 20 < distance_m(30.28, -97.74, *NEAR) < 40
    assert distance_m(30.28, -97.74, *FAR) > 3000


def test_far_from_every_mark_drafts_a_new_spot_and_writes_nothing() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "house party", *FAR))
    assert out.understood and out.new_place and out.place_source == "new"
    assert out.place == "house party" and "new spot" in out.spoken
    assert w.creator.created == [] and w.moves.created == []


def test_confirm_creates_the_mark_once_then_the_move() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "house party", *FAR))
    first = run(w.service.confirm("ana", out.draft_id))
    again = run(w.service.confirm("ana", out.draft_id))
    assert first.move_id == again.move_id
    assert len(w.creator.created) == 1 and len(w.moves.created) == 1
    _, spot = w.creator.created[0]
    assert (spot.lat, spot.lng) == ROUND_FAR  # rounded to ~100 m
    assert w.moves.created[0][1].mark_id == "new-1"


def test_near_a_mark_uses_it_instead_of_a_new_spot() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "boba", *NEAR))
    assert out.place_source == "nearby" and not out.new_place
    run(w.service.confirm("ana", out.draft_id))
    assert w.creator.created == []


def test_a_named_event_gets_its_own_spot_even_near_a_mark() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "party", *NEAR, new_place_name=HOUSE))
    assert out.new_place and out.place == HOUSE


def test_no_coordinates_never_creates_a_spot() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "house party"))
    assert out.needs_place and not out.new_place and w.creator.created == []


def test_new_spot_name_and_text_are_cleaned_and_truncated() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "<b>party</b>\n" + "z" * 300, *FAR))
    assert "<" not in out.place and "\n" not in out.place and len(out.place) <= 60


def test_failure_creating_the_spot_posts_nothing_and_can_retry() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "house party", *FAR))
    w.creator.fail = True
    with pytest.raises(PlaceFailed):
        run(w.service.confirm("ana", out.draft_id))
    assert w.moves.created == []
    w.creator.fail = False
    assert run(w.service.confirm("ana", out.draft_id)).move_id
    assert len(w.creator.created) == 1


def test_expired_new_spot_draft_creates_nothing() -> None:
    w = World()
    out = run(w.service.draft_from_text("ana", "house party", *FAR))
    w.clock.advance(minutes=6)
    with pytest.raises(DraftExpired):
        run(w.service.confirm("ana", out.draft_id))
    assert w.creator.created == []


def test_without_a_creator_the_nearest_mark_is_used_as_before() -> None:
    w = World()
    bare = GlassesService(
        clock=w.clock,
        muse=w.muse,
        marks=w.marks,
        moves=w.moves,
        drafts=w.drafts,
        lock=asyncio.Lock(),
    )
    out = run(bare.draft_from_text("ana", "boba", *FAR))
    assert out.place_source == "nearby" and not out.new_place


# -- over MCP: Muse is not the user's phone, so it never makes spots --------------


def test_mcp_never_creates_a_spot_even_with_coordinates() -> None:
    rig = Rig(person("bo", "Bo Lee"))
    creator = FakeCreator()
    rig.tools.glasses = GlassesService(
        clock=rig.clock,
        muse=rig.muse,
        marks=rig.marks,
        moves=rig.moves,
        drafts=rig.drafts,
        lock=asyncio.Lock(),
        creator=creator,
    )
    out = run(rig.tools.draft_move("party", None, HOUSE, *FAR))
    assert out["status"] == "needs_place" and "Where at?" in out["spoken"]
    far = run(rig.tools.draft_move("street fair", None, None, *FAR))
    assert far["status"] == "needs_place"
    assert creator.created == [] and rig.moves.created == [] and len(rig.drafts) == 0


# -- the real adapter -------------------------------------------------------------


def test_sql_place_creator_makes_a_user_mark(engine, session) -> None:
    from app.repositories.glasses_places import SqlPlaceCreator
    from app.services.glasses import NewPlace
    from app.tables import Mark, User
    from tests.surfaces.fakes import T0

    session.add(User(id="ana", name="Ana", first_name="Ana", created_at=T0))
    session.commit()
    creator = SqlPlaceCreator(engine, lambda: FakeClock())
    made = creator.create("ana", NewPlace("House party", "other", 30.301, -97.702))
    row = session.get(Mark, made.id)
    assert row is not None and row.source == "user" and row.created_by == "ana"
    assert (row.lat, row.lng) == (30.301, -97.702) and row.name == "House party"
