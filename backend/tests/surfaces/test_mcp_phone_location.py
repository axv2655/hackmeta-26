"""MCP place from the phone: a named venue, the phone's fresh coarse location
(nearest seeded Mark within 2 km), the usual Mark, then the demo Mark."""

import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.routes.glasses import current_user_id
from app.main import create_app
from app.services import phone_location
from app.services.glasses import GlassesService, match_named
from app.services.phone_location import PhoneLocation
from tests.surfaces.fakes import FakeClock, FakePlaces, mark
from tests.surfaces.test_mcp_tools import Rig, person

KUMO = mark("mk_kumo_matcha", "Kumo Matcha")
HS = mark("hs", "HS Coffee")
NEAR = (30.2812, -97.7421)  # ~240 m from the fake Mark, inside the 2 km radius
NEAR_ROUND = (30.281, -97.742)
WITHIN_2KM = (30.292, -97.74)  # ~1.3 km
BEYOND_2KM = (30.31, -97.74)  # ~3.3 km
MENLO_PARK = (37.4849, -122.1477)


def run(coro):
    return asyncio.run(coro)


class Phone:
    """A rig whose service reads the phone's location from a real store."""

    def __init__(
        self,
        places: FakePlaces | None = None,
        demo: bool = False,
        sharing: bool = True,
    ) -> None:
        self.rig = Rig(person("bo", "Bo Lee"))
        self.sharing = sharing
        self.store = PhoneLocation(self.rig.clock.now, lambda _user: self.sharing)
        self.rig.tools.glasses = GlassesService(
            clock=self.rig.clock,
            muse=self.rig.muse,
            marks=self.rig.marks,
            moves=self.rig.moves,
            drafts=self.rig.drafts,
            lock=asyncio.Lock(),
            places=places or FakePlaces(),
            demo_mode=lambda: demo,
            phone_point=self.store.fresh,
        )

    def draft(self, text: str = "boba", place: str | None = None):
        return run(self.rig.tools.draft_move(text, None, place, *MENLO_PARK))


# -- the store ---------------------------------------------------------------------


def test_store_rounds_and_expires_after_30_minutes() -> None:
    clock = FakeClock()
    store = PhoneLocation(clock.now, lambda _user: True)
    assert store.record("ana", 30.28123, -97.74987)
    assert store.fresh("ana") == (30.281, -97.75)
    clock.advance(minutes=30)
    assert store.fresh("ana") == (30.281, -97.75)  # exactly 30 min is still fresh
    clock.advance(seconds=1)
    assert store.fresh("ana") is None and len(store) == 0


def test_store_keeps_the_latest_point_per_user() -> None:
    clock = FakeClock()
    store = PhoneLocation(clock.now, lambda _user: True)
    store.record("ana", 1.0, 2.0)
    store.record("bo", 3.0, 4.0)
    store.record("ana", 5.0, 6.0)
    assert store.fresh("ana") == (5.0, 6.0) and store.fresh("bo") == (3.0, 4.0)


def test_store_records_nothing_when_sharing_is_off() -> None:
    clock = FakeClock()
    sharing = {"on": False}
    store = PhoneLocation(clock.now, lambda _user: sharing["on"])
    assert store.record("ana", 1.0, 2.0) is False and len(store) == 0
    sharing["on"] = True
    store.record("ana", 1.0, 2.0)
    sharing["on"] = False  # turned off after the ping: it is not used or kept
    assert store.fresh("ana") is None and len(store) == 0


def test_store_purges_old_points_on_the_next_record() -> None:
    clock = FakeClock()
    store = PhoneLocation(clock.now, lambda _user: True)
    store.record("ana", 1.0, 2.0)
    clock.advance(minutes=31)
    store.record("bo", 3.0, 4.0)
    assert len(store) == 1


# -- the order -----------------------------------------------------------------------


def test_fresh_phone_location_picks_the_nearest_mark() -> None:
    phone = Phone()
    phone.store.record("anish", *NEAR)
    out = phone.draft()
    assert out["status"] == "draft" and out["place"] == "Kumo"
    assert phone.rig.marks.nearest_calls == [(*NEAR_ROUND, 1)]  # rounded, not raw


def test_mark_within_2km_counts_and_beyond_2km_does_not() -> None:
    near = Phone(FakePlaces(usual=HS))
    near.store.record("anish", *WITHIN_2KM)
    assert near.draft()["place"] == "Kumo"
    far = Phone(FakePlaces(usual=HS))
    far.store.record("anish", *BEYOND_2KM)
    assert far.draft()["place"] == "HS Coffee"


def test_stale_phone_location_falls_back_to_the_usual_mark() -> None:
    phone = Phone(FakePlaces(usual=HS))
    phone.store.record("anish", *NEAR)
    phone.rig.clock.advance(minutes=31)
    out = phone.draft()
    assert out["place"] == "HS Coffee"
    assert phone.rig.marks.nearest_calls == []  # a stale point is never used


def test_sharing_off_ignores_the_phone_location() -> None:
    phone = Phone(FakePlaces(usual=HS), sharing=False)
    phone.store.record("anish", *NEAR)
    assert phone.draft()["place"] == "HS Coffee"


def test_no_phone_location_and_no_history_asks_where_outside_demo() -> None:
    phone = Phone(FakePlaces(demo=KUMO), demo=False)
    out = phone.draft()
    assert out["status"] == "needs_place" and "Where at?" in out["spoken"]
    assert "draft_id" not in out and len(phone.rig.drafts) == 0


def test_demo_mark_is_the_last_resort_in_demo_mode() -> None:
    phone = Phone(FakePlaces(demo=KUMO), demo=True)
    out = phone.draft()
    assert out["status"] == "draft" and out["place"] == "Kumo Matcha"
    run(phone.rig.tools.confirm_move(out["draft_id"], "r"))
    assert phone.rig.moves.created[0][1].mark_id == "mk_kumo_matcha"


def test_named_venue_beats_phone_beats_usual_beats_demo() -> None:
    places = FakePlaces(named=KUMO, usual=HS, demo=mark("d", "Demo Spot"))
    phone = Phone(places, demo=True)
    phone.store.record("anish", *NEAR)
    assert phone.draft("matcha at kumo")["place"] == "Kumo Matcha"
    places.named = None
    assert phone.draft()["place"] == "Kumo"  # the phone's nearest Mark
    phone.store.forget("anish")
    assert phone.draft()["place"] == "HS Coffee"
    places.usual = None
    assert phone.draft()["place"] == "Demo Spot"


def test_a_city_as_place_is_ignored_and_the_phone_location_is_used() -> None:
    phone = Phone(FakePlaces(usual=HS))
    phone.store.record("anish", *NEAR)
    for city in ("Menlo Park", "Palo Alto", "Downtown"):
        out = phone.draft("boba", city)
        assert out["status"] == "draft" and out["place"] == "Kumo"
    assert phone.rig.moves.created == []


def test_the_callers_own_coordinates_never_decide_anything() -> None:
    phone = Phone(FakePlaces(usual=HS))
    out = phone.draft()  # Menlo Park coordinates sent, no phone ping at all
    assert out["place"] == "HS Coffee"
    assert phone.rig.marks.nearest_calls == []


def test_coordinates_are_never_echoed_back() -> None:
    phone = Phone()
    phone.store.record("anish", *NEAR)
    out = phone.draft()
    blob = repr(out)
    for fragment in ("30.28", "97.74", "37.48", "122.14"):
        assert fragment not in blob
    assert not {"lat", "lng", "latitude", "longitude"} & set(out)


# -- naming a venue (fuzzy) ------------------------------------------------------------

NAMES = [("mk_kumo_matcha", "Kumo Matcha"), ("saku", "Saku Sushi"), ("hs", "HS Coffee")]


def test_kumo_resolves_to_kumo_matcha() -> None:
    assert match_named("kumo", NAMES) == "mk_kumo_matcha"
    assert match_named("Kumo", NAMES, fuzzy=True) == "mk_kumo_matcha"


def test_fuzzy_forgives_a_typo_only_for_a_named_venue() -> None:
    assert match_named("kumoo", NAMES, fuzzy=True) == "mk_kumo_matcha"
    assert match_named("kumoo", NAMES) is None  # free text never fuzzes


def test_fuzzy_does_not_match_a_city_or_unrelated_word() -> None:
    for word in ("Menlo Park", "Palo Alto", "downtown", "boba"):
        assert match_named(word, NAMES, fuzzy=True) is None


def test_fuzzy_ambiguity_returns_nothing() -> None:
    twins = [("a", "Kumo Matcha"), ("b", "Kumo Matcho")]
    assert match_named("kumoo", twins, fuzzy=True) is None


def test_sql_finder_kumo_to_kumo_matcha(engine, session) -> None:
    from app.repositories.glasses_places import SqlPlaceFinder
    from app.tables import Mark

    for mid, name in (("mk_kumo_matcha", "Kumo Matcha"), ("hs", "HS Coffee")):
        session.add(Mark(id=mid, name=name, category="coffee", lat=1.0, lng=2.0))
    session.commit()
    finder = SqlPlaceFinder(engine)
    found = finder.named_in("kumo", fuzzy=True)
    assert found is not None and found.id == "mk_kumo_matcha"
    assert finder.named_in("Menlo Park", fuzzy=True) is None


def test_location_sharing_gate_reads_the_users_setting(engine, session) -> None:
    from app.repositories.glasses_places import location_sharing_on
    from app.tables import User, UserSettings
    from tests.surfaces.fakes import T0

    session.add_all(
        [User(id=u, name=u, first_name=u, created_at=T0) for u in ("on", "off")]
    )
    session.commit()
    session.add_all(
        [
            UserSettings(user_id="on", location_opt_in=True),
            UserSettings(user_id="off", location_opt_in=False),
        ]
    )
    session.commit()
    gate = location_sharing_on(engine)
    assert gate("on") is True and gate("off") is False and gate("nobody") is False


# -- the ping endpoint ----------------------------------------------------------------


@pytest.fixture
def client():
    clock = FakeClock()
    app = create_app(lanes=())
    app.dependency_overrides[current_user_id] = lambda: "ana"
    with TestClient(app) as http:
        yield http, clock


def test_ping_stores_when_sharing_is_on_and_never_echoes(client) -> None:
    http, clock = client
    store = phone_location.install(PhoneLocation(clock.now, lambda _user: True))
    res = http.post("/api/v1/glasses/location", json={"lat": 30.28123, "lng": -97.74})
    assert res.status_code == 200 and res.json() == {"stored": True}
    assert store.fresh("ana") == (30.281, -97.74)
    clock.advance(minutes=31)
    assert store.fresh("ana") is None


def test_ping_is_dropped_when_sharing_is_off(client) -> None:
    http, clock = client
    store = phone_location.install(PhoneLocation(clock.now, lambda _user: False))
    res = http.post("/api/v1/glasses/location", json={"lat": 30.28, "lng": -97.74})
    assert res.json() == {"stored": False} and len(store) == 0


@pytest.mark.parametrize(
    "body",
    [{"lat": 91, "lng": 0}, {"lat": 0, "lng": 181}, {"lat": 1.0}, {}],
)
def test_ping_rejects_bad_points(client, body) -> None:
    http, _ = client
    assert http.post("/api/v1/glasses/location", json=body).status_code == 422


def test_ping_needs_a_user() -> None:
    with TestClient(create_app(lanes=())) as http:
        res = http.post("/api/v1/glasses/location", json={"lat": 1.0, "lng": 2.0})
    assert res.status_code == 401


def test_ttl_is_30_minutes() -> None:
    assert phone_location.TTL == timedelta(minutes=30)
