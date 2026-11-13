"""Muse runtime: status, token budget, honest provenance, category filter,
DEMO_MODE job gating, gateway extras and the smoke script."""

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.config import settings
from app.muse import smoke
from app.muse.client import FakeMuseClient, HttpMuseClient, client_kind
from app.muse.runner import MuseRunner
from app.muse.schemas import MoveDraftRead
from app.ports import MoveDraftOut, NotifyPickOut
from app.tables import Notification
from tests.muse import factories as f
from tests.muse.factories import T0, move_snap
from tests.muse.fakes import FakeMarkGateway, FakeMoveGateway, FixedClock

pytestmark = pytest.mark.anyio

KUMO = f.mark_snap("kumo", name="Kumo Matcha")
WRITER_OK = {
    "move_writer": {
        "text": "matcha before class?",
        "category": "coffee",
        "alternates": ["kumo run", "matcha rn", "green tea time"],
    }
}


class Out(BaseModel):
    answer: str


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def world(session: Session) -> Session:
    f.users(session, "tony", "maya", "riley", "sam")
    f.user(session, "anish", default_circle_ids=["crew"])
    f.mark_row(session, "kumo", name="Kumo Matcha")
    session.commit()
    return session


# --- /muse/status --------------------------------------------------------------


def test_status_reports_fake_client_and_not_live(engine, world, clock) -> None:
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        r = http.get("/api/v1/muse/status")
    assert r.status_code == 200
    body = r.json()
    assert body["client"] == "fake" and body["live"] is False
    assert body["model"] is None and body["vision"] is False
    assert body["budget_tokens"] == settings.MUSE_TOKEN_BUDGET
    assert body["budget_exhausted"] is False and body["tokens_used"] == 0
    assert set(body) >= {"calls", "muse_calls", "fallbacks", "fallback_rate"}


def test_client_kind_and_model() -> None:
    real = HttpMuseClient("https://muse.test", "k", "muse-1", timeout_s=25)
    assert client_kind(real) == "http" and real.model == "muse-1"
    assert client_kind(FakeMuseClient()) == "fake"


# --- token budget -------------------------------------------------------------


async def test_budget_exhaustion_skips_network_and_records_fallback(clock) -> None:
    client = FakeMuseClient({"probe": {"answer": "x" * 200}})
    runner = MuseRunner(client, clock=lambda: clock, token_budget=50)
    value, fell_back = await runner.run_agent_meta(
        "probe", None, "first " * 40, Out, lambda: Out(answer="fallback")
    )
    assert not fell_back and value.answer.startswith("x")
    assert runner.budget_exhausted
    calls = len(client.calls)

    value, fell_back = await runner.run_agent_meta(
        "probe", None, "second", Out, lambda: Out(answer="fallback")
    )
    assert fell_back and value.answer == "fallback"
    assert len(client.calls) == calls  # no network once spent
    stats = runner.get_stats()
    assert stats["fallbacks"] == 1 and stats["budget_exhausted"] is True
    assert stats["last_outputs"][0]["used_fallback"] is True
    assert stats["last_outputs"][0]["output"]["errors"] == ["budget"]


async def test_run_agent_meta_flags_garbage_and_cache(clock) -> None:
    client = FakeMuseClient({"probe": "not json"})
    runner = MuseRunner(client, clock=lambda: clock)
    _, fell_back = await runner.run_agent_meta(
        "probe", None, "p", Out, lambda: Out(answer="fb")
    )
    assert fell_back
    client.responses["probe"] = {"answer": "yes"}
    value, fell_back = await runner.run_agent_meta(
        "probe", None, "q", Out, lambda: Out(answer="fb")
    )
    assert (value.answer, fell_back) == ("yes", False)
    value, fell_back = await runner.run_agent_meta(
        "probe", None, "q", Out, lambda: Out(answer="fb")
    )
    assert (value.answer, fell_back) == ("yes", False)  # cached Muse answer


# --- compose-move provenance --------------------------------------------------


def compose(engine, clock, client, **body) -> dict:
    app, _ = f.make_app(engine, clock, client, marks=FakeMarkGateway([KUMO]))
    with TestClient(app) as http:
        r = http.post(
            "/api/v1/muse/compose-move", json=body, headers={"X-User-Id": "anish"}
        )
    assert r.status_code == 200
    return r.json()


def test_compose_reports_heuristic_when_writer_falls_back(engine, world, clock):
    client = FakeMuseClient({"move_writer": "garbage, not json"})
    draft = compose(engine, clock, client, mark_id="kumo")
    assert draft["source"] == "heuristic"
    assert draft["text"] == "getting coffee at kumo matcha, who's down?"


def test_compose_reports_muse_when_writer_answers(engine, world, clock):
    draft = compose(engine, clock, FakeMuseClient(WRITER_OK), mark_id="kumo")
    assert draft["source"] == "muse" and draft["text"] == "matcha before class?"


def test_compose_heuristic_when_resolver_falls_back(engine, world, clock):
    client = FakeMuseClient({**WRITER_OK, "place_resolver": "nope"})
    draft = compose(engine, clock, client, lat=32.98, lng=-96.75, seed_text="matcha")
    assert draft["source"] == "heuristic"


def test_move_draft_read_uses_draft_source(session, world) -> None:
    plain = MoveDraftOut(mark_id="kumo", text="matcha?", category="coffee")
    assert MoveDraftRead.of(session, plain).source == "heuristic"
    muse = MoveDraftOut(
        mark_id="kumo", text="matcha?", category="coffee", source="muse"
    )
    assert MoveDraftRead.of(session, muse).source == "muse"
    assert MoveDraftRead.of(session, muse, source="heuristic").source == "heuristic"


# --- notify picks carry source ------------------------------------------------


def preview(engine, clock, world, client) -> list[dict]:
    f.circle(world, "crew", "tony", ["maya", "riley", "sam"])
    world.commit()
    app, _ = f.make_app(engine, clock, client)
    with TestClient(app) as http:
        r = http.post(
            "/api/v1/muse/notify-preview",
            headers={"X-User-Id": "tony"},
            json={"mark_id": "kumo", "text": "getting matcha", "circle_ids": ["crew"]},
        )
    assert r.status_code == 200
    return r.json()


def test_notify_preview_picks_say_heuristic_on_fallback(engine, world, clock):
    picks = preview(engine, clock, world, FakeMuseClient({"notify_picker": "?"}))
    assert picks and all(p["source"] == "heuristic" for p in picks)


def test_notify_preview_is_ranked_without_calling_muse(engine, world, clock):
    def answer(system: str, prompt: str) -> dict:
        row = prompt.split("Candidates:\n", 1)[1].splitlines()[1]
        return {"picks": [{"user": row.split("|", 1)[0].strip(), "reason": "r"}]}

    client = FakeMuseClient({"notify_picker": answer})
    picks = preview(engine, clock, world, client)
    assert client.calls == []
    assert picks and {p["source"] for p in picks} == {"heuristic"}
    assert "posted" in picks[0]["copy"]


def test_notify_pick_out_defaults_to_heuristic() -> None:
    assert NotifyPickOut("u", "Hey U", "r").source == "heuristic"


# --- category preference ------------------------------------------------------


async def test_category_preference_excludes_recipient(engine, session, clock):
    f.users(session, "tony", "maya", "riley")
    f.user(session, "sam", move_categories=["food", "study"])
    f.mark_row(session, "kumo")
    session.commit()
    moves = FakeMoveGateway(clock)
    moves.put(move_snap("mv1", "tony"), {"maya", "riley", "sam"})
    moves.put(move_snap("mv2", "tony"), {"maya", "riley", "sam"})
    _, _, _, lane = f.wire(engine, clock, moves=moves)

    picks = await lane.gateway.notify_move("mv1", (), ())
    assert "sam" not in {p.user_id for p in picks}
    forced = await lane.gateway.notify_move("mv2", {"sam"}, {"maya", "riley"})
    assert [p.user_id for p in forced] == ["sam"]  # a force-pick still goes
    session.expire_all()
    got = session.exec(select(Notification.user_id)).all()
    assert "sam" in got


# --- lane wiring --------------------------------------------------------------


def test_demo_mode_skips_autonomous_jobs(engine, clock, monkeypatch) -> None:
    _, _, scheduler, _ = f.wire(engine, clock)
    normal = {job.name for job in scheduler.jobs}
    assert {"muse_flare_scan", "muse_nobody_bit", "muse_pseudo_groups"} <= normal

    monkeypatch.setattr(settings, "DEMO_MODE", "on")
    _, _, scheduler, _ = f.wire(engine, clock)
    names = {job.name for job in scheduler.jobs}
    assert "muse_expire_suggestions" in names
    assert not names & {"muse_flare_scan", "muse_nobody_bit", "muse_pseudo_groups"}


def test_route_on_join_is_not_registered(engine, clock) -> None:
    _, hooks, _, lane = f.wire(engine, clock)
    names = {h.__name__ for h in hooks.on_move_joined.handlers}
    assert "route_on_join" not in names and "on_move_joined" in names
    assert lane.gateway.is_bound("run_route")


async def test_gateway_extras_are_bound_and_answer(engine, world, clock) -> None:
    _, _, _, lane = f.wire(engine, clock)
    gw = lane.gateway
    for name in ("demo_flare_scan", "demo_free_time_scan", "refresh_pseudo_groups"):
        assert gw.is_bound(name)
    assert await gw.refresh_pseudo_groups(["anish"]) == 0  # no outings yet
    assert await gw.demo_free_time_scan("anish") is None  # no free window port


async def test_unbound_extras_answer_like_null(engine, clock) -> None:
    lane = f.lane(engine, f.Container(clock=clock))
    assert await lane.gateway.demo_flare_scan("anish") is None
    assert await lane.gateway.refresh_pseudo_groups(["anish"]) == 0


# --- smoke script -------------------------------------------------------------


async def test_smoke_runs_every_agent_on_the_fake_client(capsys) -> None:
    assert await smoke.main(FakeMuseClient()) == 0
    out = capsys.readouterr().out
    assert out.startswith("client=fake")
    for probe in smoke.PROBES:
        assert probe.agent in out
    assert "skip" not in out
