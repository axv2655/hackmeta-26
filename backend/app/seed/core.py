"""Seed step owned by the core lane (C10): the people and places of the demo
world, and what is happening right now (ARCHITECTURE.md 15.1, 15.3).

Writes only core tables: users, friendships, Circles, blocks, settings,
auto-join prefs, Marks, saved Marks, and the live and last-night Moves with
their audiences, participants, Moments and tags. History (8 weeks of ended
Moves, hangouts), ratings, Reels and calendar belong to the surfaces seed.

The world is plain data tables below; `seed` only turns them into rows.
Every id is stable (from `app.seed.ids`, or a fixed local id for rows no
other lane refers to) and every time is relative to `clock.now()`, so the
same clock always yields the same rows.

Moves go through the core code paths: `domain.moves.plan_move` builds them,
`domain.privacy.resolve_audience` picks their audience (the creator's Circles
and friends, minus blocks, minus self), and the participant rules (`join`,
`arrive`, `leave`, `end`) produce every participant row, so a seeded Move
obeys the same rules as a posted one.

The demo storyline this supports:

* Anish's Reel tap on Kumo Matcha finds Tony's live Move with Maya and
  Dhivyesh there; Priya is in its audience but not there, so she can get the
  "Anish is pulling up" nudge.
* Maya's Move at The Rooftop at Northside ended last night: Maya, Tony and
  Priya are ghosts there, with approved Moments Anish can see (he was in the
  audience but did not go).
* Jordan, not Anish's friend, hosts an open pickleball Move with his crew of
  three: the "nobody bit" fallback.
* Mom is Anish's friend, in none of his Circles, and on his hidden-from list.
* Anish saved Kumo Matcha from the Kumo Reel 3 days ago (the flare demo).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

from sqlmodel import Session

from app.core.areas import CENTER, HOME_AREA
from app.core.config import settings
from app.domain import moves as rules
from app.domain.moves import NewMove
from app.domain.privacy import ResolvedAudience, resolve_audience
from app.ports import (
    Category,
    Clock,
    MoveCreate,
    MoveSnapshot,
    ParticipantSnapshot,
    SaveSource,
)
from app.repositories.audience import SqlAudienceRepository
from app.repositories.moves import SqlMoveRepository
from app.seed import ids, media
from app.tables import (
    AutojoinPref,
    Block,
    Circle,
    CircleMember,
    Friendship,
    Mark,
    Moment,
    MomentTag,
    Move,
    SavedMark,
    User,
    UserSettings,
)

# --- People -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Person:
    id: str
    name: str
    first_name: str
    color: str
    home_area: str = HOME_AREA
    joined_days_ago: int = 400


PEOPLE: tuple[Person, ...] = (
    Person(ids.ANISH, "Anish Rao", "Anish", "#1877F2"),
    Person(ids.TONY, "Tony Nguyen", "Tony", "#F02849"),
    Person(ids.MAYA, "Maya Chen", "Maya", "#8B5CF6"),
    Person(ids.PRIYA, "Priya Shah", "Priya", "#10B981"),
    Person(ids.DEV, "Dev Mehta", "Dev", "#F59E0B"),
    Person(ids.DHIVYESH, "Dhivyesh Kumar", "Dhivyesh", "#0EA5E9"),
    Person(ids.JORDAN, "Jordan Brooks", "Jordan", "#EF4444"),
    Person(ids.MOM, "Mom", "Mom", "#EC4899", "Frisco", joined_days_ago=2000),
    Person(ids.HS_SAM, "Sam Ortiz", "Sam", "#14B8A6", "Plano"),
    Person(ids.HS_RILEY, "Riley Park", "Riley", "#6366F1", "Plano"),
    Person(ids.HS_KAI, "Kai Johnson", "Kai", "#84CC16", "Plano"),
    Person(ids.CASEY, "Casey Lee", "Casey", "#F97316"),
    Person(ids.MORGAN, "Morgan Diaz", "Morgan", "#A855F7"),
    Person(ids.TAYLOR, "Taylor Kim", "Taylor", "#22C55E"),
)

FRIENDS: tuple[tuple[str, str, int], ...] = (
    # (user, user, friends for this many days)
    (ids.ANISH, ids.TONY, 700),
    (ids.ANISH, ids.MAYA, 500),
    (ids.ANISH, ids.PRIYA, 450),
    (ids.ANISH, ids.DEV, 500),
    (ids.ANISH, ids.DHIVYESH, 700),
    (ids.ANISH, ids.MOM, 2000),
    (ids.ANISH, ids.HS_SAM, 1800),
    (ids.ANISH, ids.HS_RILEY, 1800),
    (ids.ANISH, ids.HS_KAI, 1800),
    (ids.TONY, ids.MAYA, 400),
    (ids.TONY, ids.PRIYA, 400),
    (ids.TONY, ids.DEV, 300),
    (ids.TONY, ids.DHIVYESH, 700),
    (ids.MAYA, ids.PRIYA, 350),
    (ids.MAYA, ids.DEV, 500),
    (ids.PRIYA, ids.DHIVYESH, 200),
    (ids.DEV, ids.DHIVYESH, 300),
    (ids.DEV, ids.JORDAN, 250),  # Anish's one mutual friend with Jordan
    (ids.HS_SAM, ids.HS_RILEY, 1800),
    (ids.HS_SAM, ids.HS_KAI, 1800),
    (ids.HS_RILEY, ids.HS_KAI, 1800),
    (ids.JORDAN, ids.CASEY, 300),
    (ids.JORDAN, ids.MORGAN, 300),
    (ids.JORDAN, ids.TAYLOR, 300),
    (ids.CASEY, ids.MORGAN, 300),
    (ids.CASEY, ids.TAYLOR, 300),
    (ids.MORGAN, ids.TAYLOR, 300),
)


@dataclass(frozen=True, slots=True)
class CircleSpec:
    id: str
    owner_id: str
    name: str
    emoji: str
    members: tuple[str, ...]
    fb_group_name: str | None = None


# fmt: off
CIRCLES: tuple[CircleSpec, ...] = (
    CircleSpec(ids.CIRCLE_ROOMMATES, ids.ANISH, "Roommates", "🏠",
               (ids.TONY, ids.DHIVYESH)),
    CircleSpec(ids.CIRCLE_CLIMBING, ids.ANISH, "Climbing", "🧗",
               (ids.MAYA, ids.DEV), fb_group_name="UTD Climbing"),
    CircleSpec(ids.CIRCLE_HS_FRIENDS, ids.ANISH, "HS friends", "🎓",
               ids.HS_FRIENDS),
    CircleSpec(ids.CIRCLE_STUDY_GROUP, ids.ANISH, "Study group", "📚",
               (ids.PRIYA, ids.MAYA, ids.DHIVYESH)),
)
# fmt: on

BLOCKS: tuple[tuple[str, str], ...] = (
    # (user, hidden from): the user's Moves are never shown to them.
    (ids.ANISH, ids.MOM),
)

AUTOJOIN: tuple[tuple[str, str], ...] = (
    # (user, other): the user may be silently auto-joined when with the other.
    (ids.ANISH, ids.TONY),
    (ids.ANISH, ids.DHIVYESH),
    (ids.TONY, ids.ANISH),
    (ids.PRIYA, ids.ANISH),
)


@dataclass(frozen=True, slots=True)
class Prefs:
    """A user's `user_settings`; the defaults are the table's defaults."""

    location: bool = False
    ble: bool = False
    calendar: bool = False
    open_moves: bool = False
    muse_proactive: bool = True
    ghost_visible: bool = True
    categories: tuple[Category, ...] = ()
    default_circles: tuple[str, ...] = ()
    quiet_hours: tuple[int, int] | None = None  # (start, end) local hours


STUDENT = Prefs(
    location=True,
    ble=True,
    calendar=True,
    categories=("coffee", "food", "study", "fitness", "games"),
)
CREW = Prefs(ble=True, open_moves=True, categories=("fitness",))

PREFS: Mapping[str, Prefs] = {
    ids.ANISH: Prefs(
        location=True,
        ble=True,
        calendar=True,
        open_moves=True,
        categories=("coffee", "food", "study", "fitness", "games", "outdoors"),
        default_circles=(ids.CIRCLE_ROOMMATES, ids.CIRCLE_CLIMBING),
        quiet_hours=(1, 8),
    ),
    ids.TONY: STUDENT,
    ids.MAYA: STUDENT,
    ids.PRIYA: STUDENT,
    ids.DEV: STUDENT,
    ids.DHIVYESH: STUDENT,
    ids.JORDAN: Prefs(
        location=True, ble=True, open_moves=True, categories=("fitness",)
    ),
    ids.CASEY: CREW,
    ids.MORGAN: CREW,
    ids.TAYLOR: CREW,
    ids.MOM: Prefs(muse_proactive=False, quiet_hours=(22, 7)),
    # HS friends keep the defaults: no opt-ins.
}

# --- Places -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Place:
    """A Mark, placed by its offset in km from `CENTER`."""

    id: str
    name: str
    category: Category
    north_km: float
    east_km: float
    price_level: int | None
    address: str
    vibes: str  # space-separated vibe tags


KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LNG = 93.2  # at the demo center's latitude

# fmt: off
PLACES: tuple[Place, ...] = (
    # Coffee, matcha, boba
    Place(ids.KUMO_MATCHA, "Kumo Matcha", "coffee", 0.6, -1.5, 2,
          "2150 W Campbell Rd, Richardson", "aesthetic matcha cozy quiet"),
    Place("mk_leaf_whisk", "Leaf & Whisk Matcha", "coffee", -2.5, 2.3, 2,
          "1300 E Belt Line Rd, Richardson", "aesthetic matcha outlets"),
    Place("mk_maiko_matcha", "Maiko Matcha House", "coffee", 1.8, -2.1, 2,
          "3001 Coit Rd, Richardson", "aesthetic matcha dessert"),
    Place("mk_greenroom_tea", "Greenroom Tea Bar", "coffee", -0.7, 3.5, 2,
          "500 W Arapaho Rd, Richardson", "matcha quiet plants"),
    Place(ids.FAT_STRAWS, "Fat Straws", "coffee", 0.5, -2.0, 1,
          "2150 Coit Rd, Plano", "boba late-night cheap"),
    Place(ids.QUIET_CAFE, "Wildflower Coffee Co.", "coffee", -1.5, -0.5, 2,
          "810 W Campbell Rd, Richardson", "quiet aesthetic outlets"),
    Place(ids.CAPTION_CAFE, "Sunbeam Matcha Bar", "coffee", 2.8, 1.0, 2,
          "1450 E Renner Rd, Richardson", "matcha aesthetic sunny"),
    Place("mk_common_ground", "Common Ground Coffee", "coffee", -4.2, 1.8, 1,
          "200 N Greenville Ave, Richardson", "study outlets busy"),
    Place("mk_starbucks_campbell", "Starbucks Campbell Rd", "coffee", 0.1, -1.1, 2,
          "800 W Campbell Rd, Richardson", "chain busy quick"),
    # Food
    Place(ids.CHIPOTLE, "Chipotle Campbell Rd", "food", 0.2, -1.3, 1,
          "1000 W Campbell Rd, Richardson", "quick cheap chain"),
    Place("mk_velvet_taco", "Velvet Taco", "food", 3.1, -1.6, 2,
          "7300 Lone Star Dr, Plano", "tacos late-night"),
    Place("mk_pho_city", "Pho City", "food", -2.0, 1.2, 1,
          "1005 E Arapaho Rd, Richardson", "pho cozy cheap"),
    Place("mk_seoul_kalbi", "Seoul Kalbi House", "food", -3.0, -1.0, 3,
          "2625 Old Denton Rd, Carrollton", "korean-bbq groups"),
    Place("mk_canes_coit", "Raising Cane's Coit Rd", "food", 1.2, -2.3, 1,
          "2001 Coit Rd, Plano", "quick cheap late-night"),
    Place("mk_halal_guys", "The Halal Guys", "food", 3.5, 0.3, 1,
          "1301 E Renner Rd, Richardson", "quick cheap"),
    # Study
    Place(ids.FOUNDERS_HALL, "Founders Hall Study Lounge", "study", 0.0, 0.0, None,
          "800 W Campbell Rd, Richardson", "quiet outlets whiteboards"),
    Place("mk_mcdermott_library", "McDermott Library", "study", 0.05, 0.25, None,
          "800 W Campbell Rd, Richardson", "quiet outlets late-night"),
    Place("mk_ecsw_rooms", "ECSW Study Rooms", "study", -0.1, -0.2, None,
          "800 W Campbell Rd, Richardson", "group-rooms outlets"),
    Place("mk_richardson_library", "Richardson Public Library", "study", -4.0, 2.6,
          None, "900 Civic Center Dr, Richardson", "quiet wifi"),
    # Fitness
    Place(ids.CLIMBING_GYM, "Summit Climbing Gym", "fitness", 3.4, 4.0, 2,
          "1400 Summit Ave, Plano", "bouldering social"),
    Place(ids.PICKLEBALL_COURT, "Breckinridge Pickleball Courts", "fitness", -0.8,
          6.1, None, "3300 Brand Rd, Richardson", "pickleball outdoor drop-in"),
    Place("mk_activity_center", "UTD Activity Center", "fitness", -0.05, 0.1, None,
          "800 W Campbell Rd, Richardson", "gym pickup-basketball"),
    # Nightlife
    Place(ids.LAST_NIGHT_SPOT, "The Rooftop at Northside", "nightlife", 0.4, -0.4, 2,
          "2700 Northside Blvd, Richardson", "rooftop views music"),
    Place("mk_hideout_karaoke", "Hideout Karaoke Lounge", "nightlife", -2.7, -1.9, 2,
          "2150 N Josey Ln, Carrollton", "karaoke groups late-night"),
    # Outdoors
    Place("mk_breckinridge_park", "Breckinridge Park", "outdoors", -0.6, 6.4, None,
          "3300 Brand Rd, Richardson", "trails picnic sunset"),
    Place("mk_cottonwood_trail", "Cottonwood Creek Trail", "outdoors", -1.0, 1.6,
          None, "Cottonwood Park, Richardson", "run bike shade"),
    Place("mk_reflection_pool", "UTD Reflection Pool", "outdoors", 0.02, 0.12, None,
          "800 W Campbell Rd, Richardson", "chill photos"),
    # Games
    Place("mk_pinstack", "Pinstack", "games", 3.0, -2.6, 2,
          "6205 Dallas Pkwy, Plano", "bowling arcade groups"),
    Place("mk_topgolf", "Topgolf Allen", "games", 8.5, 3.0, 3,
          "1500 Chelsea Blvd, Allen", "golf groups late-night"),
    Place("mk_dice_cafe", "Dice & Dragons Board Game Cafe", "games", -1.8, 0.9, 1,
          "400 N Coit Rd, Richardson", "board-games cozy"),
    # Shopping
    Place("mk_cityline", "CityLine Plaza", "shopping", 1.7, 3.3, 2,
          "1150 State St, Richardson", "walkable food-hall"),
    Place("mk_ranch_market", "99 Ranch Market", "shopping", -1.2, 2.0, 1,
          "100 S Central Expy, Richardson", "groceries snacks"),
    Place("mk_thrift_haus", "Thrift Haus", "shopping", -2.3, 3.0, 1,
          "550 W Spring Valley Rd, Richardson", "thrift vintage"),
    # Errands
    Place("mk_dart_bush", "DART CityLine/Bush Station", "errand", 1.6, 3.6, None,
          "1201 State St, Richardson", "transit"),
    Place("mk_love_field", "Love Field Departures", "errand", -19.0, -9.5, None,
          "8008 Herb Kelleher Way, Dallas", "airport-run"),
    # Other
    Place("mk_spirit_rock", "The Spirit Rock", "other", -0.08, 0.05, None,
          "800 W Campbell Rd, Richardson", "campus photos"),
)
# fmt: on


@dataclass(frozen=True, slots=True)
class Save:
    user_id: str
    mark_id: str
    days_ago: float
    source: SaveSource = "map"
    source_ref: str | None = None
    note: str = ""


SAVES: tuple[Save, ...] = (
    Save(ids.ANISH, ids.KUMO_MATCHA, 3, "reel", ids.REEL_KUMO, "matcha w priya?"),
    Save(ids.ANISH, ids.FAT_STRAWS, 12),
    Save(ids.ANISH, ids.FOUNDERS_HALL, 30),
    Save(ids.ANISH, "mk_topgolf", 20, note="birthday plan"),
    Save(ids.PRIYA, ids.KUMO_MATCHA, 9),
    Save(ids.PRIYA, "mk_leaf_whisk", 15),
    Save(ids.MAYA, ids.CLIMBING_GYM, 60),
    Save(ids.TONY, ids.CHIPOTLE, 40),
)

# --- Moves happening now, and last night --------------------------------------
#
# A Move's `started` is minutes before now; every other time (joins, arrivals,
# leaves, the end, Moments) is minutes after that Move started.


@dataclass(frozen=True, slots=True)
class Joiner:
    """Someone who pulled up: joined `going`, arrived `there`, maybe left."""

    user_id: str
    joined: int
    arrived: int | None = None
    left: int | None = None


@dataclass(frozen=True, slots=True)
class SeedMove:
    """A Move replayed through the core rules. The creator posts it from the
    Mark (`there`). Its audience is the creator's `circles` plus `direct`
    picks, which default to every friend of the creator. `ended` (with the
    creator's `creator_left`) makes it a Move that is over."""

    id: str
    creator_id: str
    mark_id: str
    text: str
    started: int
    joiners: tuple[Joiner, ...]
    circles: tuple[str, ...] = ()
    direct: tuple[str, ...] | None = None
    open: bool = False
    creator_left: int | None = None
    ended: int | None = None


LAST_NIGHT = 18 * 60
"""Last night's Move started 18h before now (evening, for an afternoon demo)
and ran 3h, so its ghosts are well inside the 24h ghost window (7.4)."""

# fmt: off
MOVES: tuple[SeedMove, ...] = (
    SeedMove(ids.MOVE_TONY_KUMO, ids.TONY, ids.KUMO_MATCHA,
             "matcha at kumo, come thru", started=25,
             joiners=(Joiner(ids.MAYA, joined=3, arrived=13),
                      Joiner(ids.DHIVYESH, joined=10, arrived=20))),
    SeedMove(ids.MOVE_JORDAN_PICKLEBALL, ids.JORDAN, ids.PICKLEBALL_COURT,
             "open pickleball, rotating in. grab a paddle", started=40, open=True,
             joiners=(Joiner(ids.CASEY, joined=2, arrived=10),
                      Joiner(ids.MORGAN, joined=5, arrived=12),
                      Joiner(ids.TAYLOR, joined=7, arrived=20))),
    SeedMove(ids.MOVE_LAST_NIGHT, ids.MAYA, ids.LAST_NIGHT_SPOT,
             "sunset on the rooftop, who's down?", started=LAST_NIGHT,
             joiners=(Joiner(ids.TONY, joined=5, arrived=10, left=160),
                      Joiner(ids.PRIYA, joined=15, arrived=30, left=170)),
             creator_left=180, ended=180),
)
# fmt: on


@dataclass(frozen=True, slots=True)
class MomentSpec:
    """A Moment and its tags (True approved, None not answered yet). It is
    `approved` once every tag is, so an untagged Moment is approved."""

    id: str
    move_id: str
    author_id: str
    at: int
    caption: str
    tags: Mapping[str, bool | None]


# fmt: off
MOMENTS: tuple[MomentSpec, ...] = (
    MomentSpec("mo_last_night_sunset", ids.MOVE_LAST_NIGHT, ids.MAYA, 45,
               "golden hour from up here", {ids.TONY: True, ids.PRIYA: True}),
    MomentSpec("mo_last_night_skyline", ids.MOVE_LAST_NIGHT, ids.PRIYA, 60,
               "the skyline tho", {}),
    MomentSpec("mo_last_night_toast", ids.MOVE_LAST_NIGHT, ids.TONY, 90,
               "cheers to no midterms", {ids.MAYA: True}),
    # Pending: only participants see it until Priya approves.
    MomentSpec("mo_last_night_candid", ids.MOVE_LAST_NIGHT, ids.TONY, 120,
               "caught priya mid-laugh", {ids.PRIYA: None}),
    MomentSpec("mo_kumo_first_sip", ids.MOVE_TONY_KUMO, ids.MAYA, 17,
               "first sip >>>", {}),
)
# fmt: on

# --- Writing ------------------------------------------------------------------


def seed(session: Session, clock: Clock) -> None:
    """Write the core world into an empty database. Flushes but does not
    commit: the runner commits once every lane's step has run."""
    now = clock.now()
    session.add_all(_user(person, now) for person in PEOPLE)
    session.add_all(_friendship(a, b, now - timedelta(days=d)) for a, b, d in FRIENDS)
    session.add_all(_settings(person.id) for person in PEOPLE)
    session.add_all(AutojoinPref(user_id=u, other_user_id=o) for u, o in AUTOJOIN)
    session.add_all(Block(user_id=u, hidden_from_user_id=h) for u, h in BLOCKS)
    session.add_all(_circle(spec) for spec in CIRCLES)
    session.flush()  # members, Marks and Moves refer to the rows above
    session.add_all(
        CircleMember(circle_id=spec.id, user_id=user_id)
        for spec in CIRCLES
        for user_id in spec.members
    )
    session.add_all(_mark(place) for place in PLACES)
    session.flush()
    session.add_all(_saved_mark(save, now) for save in SAVES)
    starts: dict[str, datetime] = {}
    for move in MOVES:
        starts[move.id] = now - timedelta(minutes=move.started)
        _replay(session, move, starts[move.id])
    for moment in MOMENTS:
        _add_moment(session, moment, starts[moment.move_id])
    session.flush()


def friends_of(user_id: str) -> tuple[str, ...]:
    """`user_id`'s friends, in `FRIENDS` order."""
    return tuple(b if a == user_id else a for a, b, _ in FRIENDS if user_id in (a, b))


def _user(person: Person, now: datetime) -> User:
    return User(
        id=person.id,
        name=person.name,
        first_name=person.first_name,
        avatar_url="",  # clients draw initials on `avatar_color`
        avatar_color=person.color,
        fb_verified=True,  # every demo user is "Verified with Facebook" (12.3)
        home_area=person.home_area,
        created_at=now - timedelta(days=person.joined_days_ago),
    )


def _friendship(a: str, b: str, since: datetime) -> Friendship:
    low, high = sorted((a, b))
    return Friendship(user_a=low, user_b=high, since=since)


def _settings(user_id: str) -> UserSettings:
    prefs = PREFS.get(user_id, Prefs())
    quiet = prefs.quiet_hours
    return UserSettings(
        user_id=user_id,
        location_opt_in=prefs.location,
        ble_opt_in=prefs.ble,
        calendar_opt_in=prefs.calendar,
        open_moves_opt_in=prefs.open_moves,
        muse_proactive=prefs.muse_proactive,
        ghost_visible=prefs.ghost_visible,
        default_circle_ids=list(prefs.default_circles),
        move_categories=list(prefs.categories),
        quiet_hours=None if quiet is None else {"start": quiet[0], "end": quiet[1]},
    )


def _circle(spec: CircleSpec) -> Circle:
    return Circle(
        id=spec.id,
        owner_id=spec.owner_id,
        name=spec.name,
        emoji=spec.emoji,
        fb_group_name=spec.fb_group_name,
    )


def _mark(place: Place) -> Mark:
    lat, lng = CENTER
    return Mark(
        id=place.id,
        name=place.name,
        category=place.category,
        lat=round(lat + place.north_km / KM_PER_DEG_LAT, 6),
        lng=round(lng + place.east_km / KM_PER_DEG_LNG, 6),
        address=place.address,
        photo_url=media.mark_photo_url(place.category),
        price_level=place.price_level,
        vibe_tags=place.vibes.split(),
        source="seed",
    )


def _saved_mark(save: Save, now: datetime) -> SavedMark:
    return SavedMark(
        user_id=save.user_id,
        mark_id=save.mark_id,
        source=save.source,
        source_ref=save.source_ref,
        note=save.note,
        saved_at=now - timedelta(days=save.days_ago),
    )


# --- Moves through the core rules ---------------------------------------------

Step = Literal["join", "arrive", "leave"]


def _replay(session: Session, spec: SeedMove, start: datetime) -> None:
    """Post the Move at `start`, then apply every join, arrival and leave in
    time order with the participant rules, and end it if it is over."""
    mark = session.get_one(Mark, spec.mark_id)
    draft = MoveCreate(
        mark_id=spec.mark_id,
        text=spec.text,
        category=mark.category,
        circle_ids=spec.circles,
        user_ids=friends_of(spec.creator_id) if spec.direct is None else spec.direct,
        open=spec.open,
        creator_there=True,
    )
    _create(session, spec.id, rules.plan_move(spec.creator_id, draft, start), draft)

    moves = SqlMoveRepository(session)
    for minutes, step, user_id in _timeline(spec):
        when = start + timedelta(minutes=minutes)
        changed = _apply(_snapshot(moves, spec.id), step, user_id, when)
        if changed is not None:
            moves.save_participant(spec.id, changed)
    if spec.ended is not None:
        when = start + timedelta(minutes=spec.ended)
        ended = rules.end(_snapshot(moves, spec.id), "everyone_left", when)
        moves.set_ended(spec.id, ended.status, when)


def _timeline(spec: SeedMove) -> list[tuple[int, Step, str]]:
    steps: list[tuple[int, Step, str]] = []
    for joiner in spec.joiners:
        steps.append((joiner.joined, "join", joiner.user_id))
        if joiner.arrived is not None:
            steps.append((joiner.arrived, "arrive", joiner.user_id))
        if joiner.left is not None:
            steps.append((joiner.left, "leave", joiner.user_id))
    if spec.creator_left is not None:
        steps.append((spec.creator_left, "leave", spec.creator_id))
    return sorted(steps, key=lambda step: step[0])


def _apply(
    move: MoveSnapshot, step: Step, user_id: str, when: datetime
) -> ParticipantSnapshot | None:
    if step == "join":
        return rules.join(move, user_id, "going", "tap", when)
    if step == "arrive":
        return rules.arrive(move, user_id, when)
    return rules.leave(move, user_id, when)


def _create(session: Session, move_id: str, new: NewMove, draft: MoveCreate) -> None:
    """`SqlMoveRepository.create` with a stable id the demo can name: the Move,
    its creator as participant, and its audience as `POST /moves` resolves it
    (7.2)."""
    audiences = SqlAudienceRepository(session)
    circles = audiences.owned_circles(new.creator_id, draft.circle_ids)
    audience: ResolvedAudience = resolve_audience(
        new.creator_id,
        {circle.id: circle.member_ids for circle in circles},
        draft.user_ids,
        audiences.hidden_from(new.creator_id),
    )
    session.add(
        Move(
            id=move_id,
            creator_id=new.creator_id,
            mark_id=new.mark_id,
            text=new.text,
            category=new.category,
            kind=new.kind,
            open=new.open,
            starts_at=new.starts_at,
            fill_deadline=new.fill_deadline,
            origin=new.origin,
            origin_ref=new.origin_ref,
            created_at=new.starts_at,
        )
    )
    session.flush()
    SqlMoveRepository(session).save_participant(move_id, new.creator)
    audiences.save(move_id, audience)
    session.flush()


def _snapshot(moves: SqlMoveRepository, move_id: str) -> MoveSnapshot:
    move = moves.get(move_id)
    if move is None:
        raise LookupError(move_id)
    return move


def _add_moment(session: Session, spec: MomentSpec, move_start: datetime) -> None:
    move = session.get_one(Move, spec.move_id)
    filename = media.materialize_moment(spec.id, Path(settings.MEDIA_DIR))
    approved = all(answer is True for answer in spec.tags.values())
    session.add(
        Moment(
            id=spec.id,
            move_id=spec.move_id,
            mark_id=move.mark_id,
            author_id=spec.author_id,
            media_url=f"/media/{filename}",
            media_type="photo",
            caption=spec.caption,
            status="approved" if approved else "pending",
            created_at=move_start + timedelta(minutes=spec.at),
        )
    )
    session.add_all(
        MomentTag(moment_id=spec.id, user_id=user_id, approved=answer)
        for user_id, answer in spec.tags.items()
    )
