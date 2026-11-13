"""Deterministic recommendations: flare / free-time scoring (domain/recommend.py)
and the flare scan in MUSE_DETERMINISTIC mode."""

from datetime import timedelta

import pytest

from app.core.config import settings
from app.domain.recommend import (
    FLARE_MIN,
    PersonOption,
    PlaceOption,
    decide,
    invites,
    place_score,
    rank_places,
)
from app.muse.client import FakeMuseClient
from app.ports import FreeWindow
from app.tables import MarkRanking
from tests.muse import factories as f
from tests.muse.factories import T0, days, mark_snap
from tests.muse.fakes import (
    FakeCalendar,
    FakeMarkGateway,
    FakeMoveGateway,
    FixedClock,
    RecordingPublisher,
)

pytestmark = pytest.mark.anyio


# --- pure scoring --------------------------------------------------------------


def test_a_place_needs_a_real_signal_to_flare() -> None:
    plain = PlaceOption("plain", saved_days=0)  # only "saved today"
    assert place_score(plain) < FLARE_MIN
    assert decide([plain], []) is None
    loved = PlaceOption("loved", rating=9.0, saved_days=20)
    crew_spot = PlaceOption("crew", together=3, saved_days=20)
    fits = PlaceOption("fits", taste_fit=True, saved_days=20)
    for o in (loved, crew_spot, fits):
        assert place_score(o) >= FLARE_MIN, o


def test_best_place_wins_and_ties_break_by_save_age_then_id() -> None:
    a = PlaceOption("a", rating=8.0, saved_days=10)
    b = PlaceOption("b", rating=9.5, saved_days=10)
    assert [o.mark_id for o in rank_places([a, b])] == ["b", "a"]
    x, y = PlaceOption("x", saved_days=3), PlaceOption("y", saved_days=3)
    assert [o.mark_id for o in rank_places([y, x])] == ["x", "y"]


def test_invites_by_affinity_with_crew_bonus_positive_only() -> None:
    people = [
        PersonOption("tony", 3.0),
        PersonOption("dev", 1.5, crew=True),  # 3.5 with the crew bonus
        PersonOption("stranger", -4.5),
    ]
    assert [p.user_id for p in invites(people)] == ["dev", "tony"]
    assert [p.user_id for p in invites([PersonOption("s", -4.5)], force=True)] == ["s"]


def test_free_time_only_for_someone_you_actually_meet() -> None:
    assert decide([], [PersonOption("stranger", -4.5)]) is None
    d = decide([], [PersonOption("priya", 4.0)])
    assert d is not None and d.type == "free_time"
    assert [p.user_id for p in d.invite] == ["priya"]
    forced = decide([], [PersonOption("stranger", -4.5)], force=True)
    assert forced is not None and forced.type == "free_time"


# --- flare scan with the model switched off ------------------------------------


@pytest.fixture
def world(session):
    f.users(session, "anish", "priya", "tony")
    f.friends(session, "anish", "priya", "tony")
    f.mark_row(session, "kumo", name="Kumo Matcha")
    f.mark_row(session, "cafe", name="Quiet Cafe")
    session.commit()
    return session


def wired(engine, monkeypatch):
    monkeypatch.setattr(settings, "MUSE_DETERMINISTIC", True)
    clock = FixedClock(T0)
    win = FreeWindow(T0 + timedelta(minutes=10), T0 + timedelta(minutes=60))
    client = FakeMuseClient({"flare": "never asked"})
    container, *_ = f.wire(
        engine,
        clock,
        client,
        calendar=FakeCalendar({"anish": win, "priya": win}),
        moves=FakeMoveGateway(clock),
        marks=FakeMarkGateway(
            [
                mark_snap("kumo", name="Kumo Matcha"),
                mark_snap("cafe", name="Quiet Cafe"),
            ]
        ),
        events=RecordingPublisher(),
    )
    return container, client


async def test_no_signal_means_no_flare(engine, world, monkeypatch) -> None:
    f.saved(world, "anish", "cafe", at=T0 - days(20))  # old save, nothing else
    world.commit()
    container, client = wired(engine, monkeypatch)
    assert await container.muse.run_flare_scan("anish") is None
    assert client.calls == []


async def test_loved_place_beats_a_newer_save(engine, world, monkeypatch) -> None:
    f.saved(world, "anish", "kumo", at=T0 - days(1))
    f.saved(world, "anish", "cafe", at=T0 - days(25))
    world.add(
        MarkRanking(
            user_id="anish", mark_id="cafe", category="coffee", position=0, score=9.5
        )
    )
    for k in range(3):
        f.hangout(
            world, "anish", "priya", move_id=f"h{k}", at=T0 - days(k + 2), mark_id="gym"
        )
    world.commit()
    container, client = wired(engine, monkeypatch)
    s = await container.muse.run_flare_scan("anish")
    assert s is not None and s.type == "flare"
    assert s.draft.mark_id == "cafe" and s.draft.user_ids == ("priya",)
    assert "you loved Quiet Cafe" in s.chips
    assert s.draft.source == "heuristic"
    assert client.calls == []
