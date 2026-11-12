"""M8: taste agent, taste profiles, suggest-spots."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app.muse.agents.taste import RatingFact, TasteOut, fallback_profile, valid
from app.muse.client import FakeMuseClient
from app.tables import MarkRanking, PseudoGroup, Rating, TasteProfile
from tests.muse import factories as f
from tests.muse.factories import T0, mark_snap, move_snap
from tests.muse.fakes import FakeMarkGateway, FakeMoveGateway, FixedClock

pytestmark = pytest.mark.anyio


@pytest.fixture
def clock():
    return FixedClock(T0)


@pytest.fixture
def world(session):
    f.users(session, "anish", "maya", "dev")
    f.mark_row(session, "kumo", name="Kumo Matcha", vibe_tags=["aesthetic", "quiet"])
    f.mark_row(session, "chain", name="Chain Coffee", vibe_tags=["loud"])
    f.mark_row(session, "nook", name="Book Nook", vibe_tags=["quiet", "cozy"])
    f.mark_row(session, "gym", name="Summit", category="fitness", vibe_tags=["social"])
    session.add_all(
        [
            Rating(
                move_id="mv1",
                user_id="anish",
                mark_id="kumo",
                stars=5,
                vibe_tags=["aesthetic", "cozy"],
                note="great seating",
                created_at=T0,
            ),
            Rating(
                move_id="mv1",
                user_id="maya",
                mark_id="kumo",
                stars=4,
                vibe_tags=["quiet"],
                created_at=T0,
            ),
            PseudoGroup(
                id="pg1",
                owner_id="anish",
                label="coffee crew",
                member_ids=["anish", "maya"],
            ),
            PseudoGroup(
                id="pg2",
                owner_id="anish",
                label="climbing crew",
                member_ids=["anish", "dev"],
            ),
        ]
    )
    session.commit()
    return session


@pytest.fixture
def moves(clock):
    m = FakeMoveGateway(clock)
    m.put(move_snap("mv1", "anish", there=["maya"]))
    return m


def profiles(session) -> dict[str, TasteProfile]:
    session.expire_all()
    return {p.subject_id: p for p in session.exec(select(TasteProfile)).all()}


async def test_rating_updates_rater_and_attending_pseudo_group(
    engine, world, clock, moves
) -> None:
    _, hooks, _, _ = f.wire(engine, clock, moves=moves)
    await hooks.on_rating_submitted.fire("mv1", "anish")
    got = profiles(world)
    assert set(got) == {"anish", "pg1"}  # dev did not attend: pg2 untouched
    anish = got["anish"]
    assert anish.subject_type == "user"
    assert {"aesthetic", "cozy", "coffee spots"} <= set(anish.likes)
    assert anish.summary.startswith("likes ")
    assert got["pg1"].subject_type == "pseudo_group"
    assert "quiet" in got["pg1"].likes  # maya's rating counts for the group


async def test_valid_canned_output_parses(engine, world, clock, moves) -> None:
    client = FakeMuseClient(
        {
            "taste": {
                "summary": "Likes Quiet Aesthetic Coffee Shops, not chains",
                "likes": [
                    "Aesthetic coffee shops",
                    "aesthetic coffee shops",
                    "seating",
                ],
                "dislikes": ["chains", "seating"],
            }
        }
    )
    _, hooks, _, _ = f.wire(engine, clock, client, moves=moves)
    await hooks.on_rating_submitted.fire("mv1", "anish")
    p = profiles(world)["anish"]
    assert p.summary == "likes quiet aesthetic coffee shops, not chains"
    assert p.likes == ["aesthetic coffee shops", "seating"]
    assert p.dislikes == ["chains"]  # never both liked and disliked


async def test_garbage_output_returns_valid_fallback_profile(
    engine, world, clock, moves
) -> None:
    for answer in ("garbage", {"summary": "", "likes": []}):
        client = FakeMuseClient({"taste": answer})
        _, hooks, _, _ = f.wire(engine, clock, client, moves=moves)
        await hooks.on_rating_submitted.fire("mv1", "anish")
        p = profiles(world)["anish"]
        # call + retry for the rater, and again for the attending pseudo-group
        assert p.summary and p.likes and len(client.calls) == 4


def test_fallback_profile_learns_dislikes_and_replaces_likes() -> None:
    prev = TasteOut(summary="x", likes=["loud", "coffee spots"], dislikes=["quiet"])
    out = fallback_profile(
        prev,
        [
            RatingFact(5, ("quiet",), "", "Nook", "coffee"),
            RatingFact(1, ("loud",), "", "Chain", "coffee"),
        ],
    )
    assert out.likes == ["quiet", "coffee spots"]
    assert out.dislikes == ["loud"]
    assert out.summary == "likes quiet, coffee spots; not into loud"
    empty = fallback_profile(None, [])
    assert empty.summary == "still learning what you like" and empty.likes == []


def test_valid_always_gives_a_summary() -> None:
    assert valid(TasteOut()).summary == "still learning what you like"


async def test_no_rating_no_update(engine, world, clock, moves) -> None:
    _, hooks, _, _ = f.wire(engine, clock, moves=moves)
    await hooks.on_rating_submitted.fire("mv1", "dev")
    assert profiles(world) == {}


# --- suggest-spots ---------------------------------------------------------------


def spots(engine, clock, client=None, **body):
    app, _ = f.make_app(engine, clock, client)
    with TestClient(app) as http:
        r = http.post(
            "/api/v1/muse/suggest-spots", headers={"X-User-Id": "anish"}, json=body
        )
    assert r.status_code == 200
    return r.json()


def test_fallback_spots_by_rankings_and_shared_vibe(engine, world, clock) -> None:
    world.add_all(
        [
            TasteProfile(
                subject_type="user",
                subject_id="maya",
                summary="s",
                likes=["quiet places"],
                dislikes=["loud"],
                updated_at=T0,
            ),
            MarkRanking(
                user_id="anish",
                mark_id="kumo",
                category="coffee",
                position=1,
                score=9.2,
            ),
            MarkRanking(
                user_id="maya", mark_id="kumo", category="coffee", position=1, score=9.0
            ),
        ]
    )
    world.commit()
    got = spots(engine, clock, user_ids=["maya"], category="coffee")
    assert [s["mark"]["id"] for s in got] == ["kumo", "nook"]  # chain is "loud"
    assert got[0]["reason"] == "you all rated it 9.1"
    assert got[1]["reason"] == "your vibe: quiet"


def test_muse_spots_parse_and_are_repaired(engine, world, clock) -> None:
    client = FakeMuseClient(
        {
            "suggest_spots": {
                "spots": [
                    {"mark": "k2", "reason": "new to you"},
                    {"mark": "k2", "reason": "dup"},
                    {"mark": "k99", "reason": "bogus"},
                ]
            }
        }
    )
    got = spots(engine, clock, client, user_ids=["maya"])
    assert len(got) == 3 and len({s["mark"]["id"] for s in got}) == 3
    assert got[0]["reason"] == "new to you"


def test_spots_near_location_use_mark_gateway(engine, world, clock) -> None:
    marks = FakeMarkGateway([mark_snap("near", name="Near Cafe")])
    app, _ = f.make_app(engine, clock, None, marks=marks)
    with TestClient(app) as http:
        got = http.post(
            "/api/v1/muse/suggest-spots",
            headers={"X-User-Id": "anish"},
            json={"lat": 32.98, "lng": -96.75},
        ).json()
    assert [s["mark"]["id"] for s in got] == ["near"]
    assert marks.nearest_calls == [(32.98, -96.75, 30)]
