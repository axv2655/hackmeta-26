"""HTTP round trips: crew mute / unmute, dismiss with never_again, /me/taste."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.muse import mutes
from app.muse.pseudo_groups import upsert
from app.tables import MuseMute, PseudoGroup, Suggestion, TasteProfile
from tests.muse import factories as f
from tests.muse.factories import T0, days
from tests.muse.fakes import FixedClock
from tests.muse.test_revive import seed_history

pytestmark = pytest.mark.anyio
ANISH = {"X-User-Id": "anish"}
MAYA = {"X-User-Id": "maya"}


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    seed_history(session)
    upsert(session, "anish", T0)
    session.commit()
    return session


def _climbers(http: TestClient) -> dict:
    groups = http.get("/api/v1/pseudo-groups", headers=ANISH).json()
    return next(g for g in groups if g["fading"])


def test_mute_and_unmute_crew(engine, world, clock) -> None:
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        g = _climbers(http)
        assert g["muted"] is False
        url = f"/api/v1/pseudo-groups/{g['id']}/mute"
        assert http.post(url, headers=MAYA).status_code == 404
        assert http.post(url, headers=ANISH).status_code == 204
        assert _climbers(http)["muted"] is True
        assert http.delete(url, headers=MAYA).status_code == 404
        assert http.delete(url, headers=ANISH).status_code == 204
        assert _climbers(http)["muted"] is False
        missing = http.post("/api/v1/pseudo-groups/nope/mute", headers=ANISH)
        assert missing.status_code == 404


def test_dismiss_never_again_mutes_revive_crew(engine, world, clock) -> None:
    group = _group_id(world)
    world.add(
        Suggestion(
            id="rv",
            user_id="anish",
            type="revive",
            created_at=T0,
            expires_at=T0 + days(1),
            payload={"message": "m", "group_id": group},  # older payload: no ids
        )
    )
    world.commit()
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        r = http.post(
            "/api/v1/suggestions/rv/dismiss", headers=ANISH, json={"never_again": True}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "dismissed" and body["group_id"] == group
        assert body["window_end"] is None and body["fill_minutes"] is None
        again = http.post("/api/v1/suggestions/rv/dismiss", headers=ANISH)
        assert again.status_code == 409
        assert (
            http.post("/api/v1/suggestions/x/dismiss", headers=ANISH).status_code == 404
        )
        assert _climbers(http)["muted"] is True
    assert mutes.muted_keys(world, "anish") == {"dev,maya"}


def test_dismiss_without_body_does_not_mute(engine, world, clock) -> None:
    world.add(
        Suggestion(
            id="rv",
            user_id="anish",
            type="revive",
            created_at=T0,
            expires_at=T0 + days(1),
            payload={"message": "m", "member_ids": ["dev", "maya"]},
        )
    )
    world.commit()
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        assert (
            http.post("/api/v1/suggestions/rv/dismiss", headers=ANISH).status_code
            == 200
        )
    assert world.exec(select(MuseMute)).all() == []


def test_me_taste_null_then_profile(engine, world, clock) -> None:
    app, _ = f.make_app(engine, clock)
    with TestClient(app) as http:
        r = http.get("/api/v1/me/taste", headers=ANISH)
        assert r.status_code == 200 and r.json() is None
        world.add(
            TasteProfile(
                subject_type="user",
                subject_id="anish",
                summary="likes quiet matcha spots",
                likes=["matcha", "quiet"],
                dislikes=["chains"],
                updated_at=T0,
            )
        )
        world.commit()
        got = http.get("/api/v1/me/taste", headers=ANISH).json()
        assert got["summary"] == "likes quiet matcha spots"
        assert got["likes"] == ["matcha", "quiet"] and got["dislikes"] == ["chains"]
        assert http.get("/api/v1/me/taste", headers=MAYA).json() is None


def _group_id(session) -> str:
    rows = session.exec(select(PseudoGroup)).all()
    return next(r.id for r in rows if r.fading)
