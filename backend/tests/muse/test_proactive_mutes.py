"""F31: crew mutes. Revive skips muted crews, flare drops them from the crew,
"never again" on a revive card mutes it, and refresh keeps the mute."""

import pytest
from sqlmodel import select

from app.muse import mutes
from app.muse.agents.flare import FlareScanner
from app.muse.client import FakeMuseClient
from app.muse.pseudo_groups import PseudoGroupService, upsert
from app.ports import FreeWindow
from app.services.suggestions import SuggestionService
from app.tables import MuseMute, PseudoGroup, Suggestion
from tests.muse import factories as f
from tests.muse.factories import T0, days
from tests.muse.fakes import FakeCalendar, FixedClock
from tests.muse.test_revive import WEEK, seed_history

pytestmark = pytest.mark.anyio
CLIMBERS = "dev,maya"


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    seed_history(session)
    return session


def test_members_key_sorted_owner_excluded() -> None:
    assert mutes.members_key(["maya", "dev", "dev"]) == CLIMBERS
    assert mutes.members_key(["anish", "maya", "dev"], "anish") == CLIMBERS


def test_mute_and_unmute_are_idempotent(world) -> None:
    mutes.mute(world, "anish", ["maya", "dev"], T0)
    mutes.mute(world, "anish", ["dev", "maya", "anish"], T0)
    assert mutes.muted_keys(world, "anish") == {CLIMBERS}
    assert mutes.is_muted(world, "anish", ["maya", "dev"])
    assert mutes.muted_keys(world, "maya") == set()
    mutes.unmute(world, "anish", ["dev", "maya"])
    mutes.unmute(world, "anish", ["dev", "maya"])
    assert mutes.muted_keys(world, "anish") == set()


async def test_revive_skips_muted_crew(engine, world, clock) -> None:
    mutes.mute(world, "anish", ["dev", "maya"], T0)
    container, *_ = f.wire(engine, clock)
    assert await container.muse.run_revive_scan("anish") is None
    mutes.unmute(world, "anish", ["dev", "maya"])
    s = await container.muse.run_revive_scan("anish")
    assert s is not None and set(s.draft.user_ids) == {"dev", "maya"}


async def test_revive_payload_and_honest_source(engine, world, clock) -> None:
    container, *_ = f.wire(engine, clock, FakeMuseClient(default="garbage"))
    s = await container.muse.run_revive_scan("anish")
    assert s.draft.source == "heuristic"
    world.expire_all()
    row = world.get(Suggestion, s.id)
    group = world.get(PseudoGroup, row.payload["group_id"])
    assert group is not None and row.payload["member_ids"] == ["dev", "maya"]

    client = FakeMuseClient(
        {
            "revive": {"message": "{u1} + {u2} at {k1}?", "text": "climb?"},
            "pseudo_group_label": {"label": "climbers"},
        }
    )
    container, *_ = f.wire(engine, clock, client)
    clock.advance(days=8)  # past the weekly cap
    s = await container.muse.run_revive_scan("anish")
    assert s.draft.source == "muse"


async def test_never_again_dismiss_mutes_the_crew(engine, world, clock) -> None:
    container, _, _, lane = f.wire(engine, clock)
    s = await container.muse.run_revive_scan("anish")
    SuggestionService(world, lane).dismiss("anish", s.id, never_again=True)
    assert mutes.muted_keys(world, "anish") == {CLIMBERS}
    clock.advance(days=8)  # past the weekly cap
    assert await container.muse.run_revive_scan("anish") is None


async def test_plain_dismiss_does_not_mute(engine, world, clock) -> None:
    container, _, _, lane = f.wire(engine, clock)
    s = await container.muse.run_revive_scan("anish")
    SuggestionService(world, lane).dismiss("anish", s.id)
    assert world.exec(select(MuseMute)).all() == []


async def test_refresh_owners_keeps_the_mute(engine, world, clock) -> None:
    container, _, _, lane = f.wire(engine, clock)
    upsert(world, "anish", T0)
    world.commit()
    mutes.mute(world, "anish", ["dev", "maya"], T0)
    for row in world.exec(select(PseudoGroup)).all():  # rows re-created later
        world.delete(row)
    world.commit()
    assert PseudoGroupService(world, lane).refresh_owners(["anish", "anish"]) == 3
    assert await container.muse.refresh_pseudo_groups(["anish"]) == 3
    world.expire_all()
    keys = {
        mutes.members_key(g.member_ids) for g in world.exec(select(PseudoGroup)).all()
    }
    assert CLIMBERS in keys and mutes.muted_keys(world, "anish") == {CLIMBERS}
    assert await container.muse.run_revive_scan("anish") is None


async def test_flare_crew_excludes_muted_members(engine, session, clock) -> None:
    f.users(session, "anish", "priya", "tony")
    f.friends(session, "anish", "priya", "tony")
    f.mark_row(session, "kumo")
    for k in range(4):
        f.group_hangout(
            session, ["anish", "priya"], move_id=f"h{k}", at=T0 - k * WEEK - days(1)
        )
    session.commit()
    w = FreeWindow(T0, T0 + days(0.03))
    container, _, _, lane = f.wire(
        engine, clock, calendar=FakeCalendar({"anish": w, "priya": w})
    )
    upsert(session, "anish", T0)
    session.commit()
    scanner = FlareScanner(lane)
    assert scanner.options(session, "anish").crew == {"priya"}
    mutes.mute(session, "anish", ["priya"], T0)
    assert scanner.options(session, "anish").crew == set()
