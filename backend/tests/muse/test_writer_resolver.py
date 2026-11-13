"""M5: Move writer, place resolver, compose-move."""

import pytest
from fastapi.testclient import TestClient

from app.muse.agents import move_writer, place_resolver
from app.muse.agents.move_writer import WriterInput
from app.muse.agents.place_resolver import ResolveInput, needs_confirmation
from app.muse.client import FakeMuseClient
from app.muse.runner import MuseRunner
from app.ports import PlaceResolution
from tests.muse import factories as f
from tests.muse.factories import T0, mark_snap
from tests.muse.fakes import FakeMarkGateway, FixedClock

pytestmark = pytest.mark.anyio

KUMO = mark_snap("kumo", name="Kumo Matcha", vibe_tags=("aesthetic",))
GYM = mark_snap("gym", name="Summit Climbing Gym", category="fitness", lat=32.99)
CAFE = mark_snap("cafe", name="Quiet Corner Cafe", lat=33.0)


def runner(**responses) -> tuple[MuseRunner, FakeMuseClient]:
    client = FakeMuseClient(responses)
    return MuseRunner(client, clock=lambda: FixedClock(T0)), client


WRITE = WriterInput("anish", KUMO, T0)


# --- writer -------------------------------------------------------------------


async def test_writer_valid_output_is_normalized() -> None:
    r, _ = runner(
        move_writer={
            "text": "  Getting MATCHA, who's down?  ",
            "category": "coffee",
            "alternates": ["matcha run?", "MATCHA RUN?", "x" * 80, "kumo rn"],
        }
    )
    out = await move_writer.write(r, WRITE)
    assert out.text == "getting matcha, who's down?"
    assert out.category == "coffee"
    # duplicate and too-long alternates dropped, topped up from templates to 3
    assert out.alternates[:2] == ["matcha run?", "kumo rn"]
    assert len(out.alternates) == 3
    assert all(a == a.lower() and len(a) < 60 for a in out.alternates)


async def test_writer_too_long_or_garbage_falls_back() -> None:
    for answer in ({"text": "a" * 70, "category": "coffee"}, "garbage", {"x": 1}):
        r, client = runner(move_writer=answer)
        out = await move_writer.write(r, WRITE)
        assert out.text == "getting coffee at kumo matcha, who's down?"
        assert len(client.calls) == 2


@pytest.mark.parametrize("category", sorted(move_writer.TEMPLATES))
def test_fallback_template_per_category(category) -> None:
    long = mark_snap(
        "x", name="The Extremely Long Named Place Of Many Words", category=category
    )
    out = move_writer.fallback(WriterInput("u", long, T0))
    assert out.category == category
    assert len(out.text) < 60 and out.text == out.text.lower()
    assert len(out.alternates) == 3


def test_fallback_uses_seed_text_and_guesses_category() -> None:
    out = move_writer.fallback(WriterInput("u", None, T0, seed_text="Boba run anyone?"))
    assert out.text == "boba run anyone?" and out.category == "coffee"


# --- resolver -----------------------------------------------------------------


async def test_geotag_wins_without_calling_muse() -> None:
    r, client = runner()
    res = await place_resolver.resolve(r, ResolveInput("u", [CAFE], geotag=KUMO))
    assert res == PlaceResolution("kumo", 0.95)
    assert client.calls == []


async def test_resolver_valid_output_parses() -> None:
    r, _ = runner(place_resolver={"mark": "k2", "confidence": 0.82})
    res = await place_resolver.resolve(
        r, ResolveInput("u", [KUMO, CAFE], caption="best latte in town")
    )
    assert res == PlaceResolution("cafe", 0.82)
    assert not needs_confirmation(res)


async def test_resolver_low_confidence_is_flagged() -> None:
    r, _ = runner(place_resolver={"mark": "k1", "confidence": 0.4})
    res = await place_resolver.resolve(
        r, ResolveInput("u", [KUMO], caption="cute spot")
    )
    assert res.mark_id == "kumo" and needs_confirmation(res)


async def test_resolver_new_mark() -> None:
    r, _ = runner(
        place_resolver={
            "mark": None,
            "confidence": 0.7,
            "new_mark": {
                "name": "Sol Bakery",
                "category": "food",
                "vibe_tags": ["sweet"],
            },
        }
    )
    res = await place_resolver.resolve(
        r, ResolveInput("u", [KUMO], caption="sol bakery")
    )
    assert res.mark_id is None and res.new_mark.name == "Sol Bakery"


async def test_resolver_garbage_or_unknown_alias_falls_back_to_caption_match() -> None:
    for answer in ("garbage", {"mark": "k9", "confidence": 0.9}):
        r, client = runner(place_resolver=answer)
        res = await place_resolver.resolve(
            r, ResolveInput("u", [KUMO, CAFE], caption="the quiet corner is so cozy")
        )
        assert res.mark_id == "cafe" and len(client.calls) == 2
        assert res.confidence == 0.9  # 2 of 2 name words matched


def test_heuristic_without_caption_match_uses_nearest_at_low_confidence() -> None:
    res = place_resolver.heuristic(ResolveInput("u", [GYM, CAFE], caption="vibes"))
    assert res == PlaceResolution("gym", 0.3) and needs_confirmation(res)
    assert place_resolver.heuristic(ResolveInput("u", [])) == PlaceResolution(None, 0)


async def test_frame_sent_only_with_vision() -> None:
    client = FakeMuseClient({"place_resolver": {"mark": "k1", "confidence": 0.9}})
    r = MuseRunner(client, clock=lambda: FixedClock(T0))
    res = await place_resolver.resolve(
        r, ResolveInput("u", [KUMO], frame_url="data:image/png;base64,QQ==")
    )
    assert client.calls == [] and res.mark_id == "kumo"  # text-only heuristic
    client.vision = True
    await place_resolver.resolve(
        r, ResolveInput("u", [KUMO], frame_url="data:image/png;base64,QQ==")
    )
    assert len(client.calls) == 1


# --- compose-move ---------------------------------------------------------------


@pytest.fixture
def world(session):
    f.user(session, "anish", default_circle_ids=["crew"])
    f.mark_row(session, "kumo", name="Kumo Matcha")
    session.commit()
    return session


def compose(engine, client=None, **body):
    marks = FakeMarkGateway([KUMO, GYM, CAFE])
    app, _ = f.make_app(engine, FixedClock(T0), client, marks=marks)
    with TestClient(app) as http:
        return http.post(
            "/api/v1/muse/compose-move", json=body, headers={"X-User-Id": "anish"}
        ).json(), marks


def test_compose_heuristic_returns_without_calling_muse(engine, world) -> None:
    client = FakeMuseClient({"move_writer": {"text": "matcha?", "category": "coffee"}})
    draft, _ = compose(engine, client, mark_id="kumo", heuristic=True)
    assert client.calls == []
    assert draft["source"] == "heuristic"
    assert draft["text"] == "getting coffee at kumo matcha, who's down?"
    assert draft["mark"]["id"] == "kumo" and draft["circle_ids"] == ["crew"]


def test_compose_muse_result_replaces_heuristic(engine, world) -> None:
    client = FakeMuseClient(
        {
            "move_writer": {
                "text": "matcha before class?",
                "category": "coffee",
                "alternates": ["kumo run", "matcha rn", "green tea time"],
            }
        }
    )
    draft, _ = compose(engine, client, mark_id="kumo")
    assert draft["source"] == "muse" and draft["text"] == "matcha before class?"
    assert draft["alternates"] == ["kumo run", "matcha rn", "green tea time"]


def test_compose_from_location_resolves_and_flags_low_confidence(engine, world) -> None:
    draft, marks = compose(engine, None, lat=32.98012, lng=-96.75044)
    assert marks.nearest_calls == [(32.98, -96.75, 10)]  # rounded, 10 Marks
    assert draft["nearby_mark_ids"] == ["kumo", "gym", "cafe"]
    assert draft["mark"]["id"] == "kumo" and draft["confirm_place"] is True


def test_gateway_compose_and_resolve_are_bound(engine, world) -> None:
    import asyncio

    container, *_ = f.wire(engine, FixedClock(T0), marks=FakeMarkGateway([KUMO]))
    draft = asyncio.run(container.muse.compose_move("anish", mark_id="kumo"))
    assert draft.mark_id == "kumo" and draft.text
    res = asyncio.run(container.muse.resolve_place("anish", geotag_mark_id="kumo"))
    assert res.mark_id == "kumo"
