"""Row builders for muse-lane tests: fresh data per test, never the seed.

Tests may insert rows into any table to build a world; the muse lane's
production code still only writes muse tables.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from sqlmodel import Session

from app.container import Container
from app.muse.client import FakeMuseClient
from app.muse.lane import MuseLane
from app.ports import Category, MarkSnapshot, MoveSnapshot, ParticipantSnapshot
from app.tables import (
    Circle,
    CircleMember,
    Friendship,
    Hangout,
    Mark,
    SavedMark,
    User,
    UserSettings,
)

T0 = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)  # Thu 2:00 pm demo time (UTC-6)


def user(
    session: Session,
    uid: str,
    *,
    first: str | None = None,
    verified: bool = True,
    **settings: object,
) -> User:
    first = first or uid.title()
    row = User(
        id=uid, name=f"{first} X", first_name=first, fb_verified=verified, created_at=T0
    )
    session.add(row)
    session.add(UserSettings(user_id=uid, **settings))
    return row


def users(session: Session, *uids: str, **settings: object) -> None:
    for uid in uids:
        user(session, uid, **settings)


def friends(session: Session, a: str, *others: str) -> None:
    for b in others:
        x, y = sorted((a, b))
        session.add(Friendship(user_a=x, user_b=y, since=T0))


def circle(session: Session, cid: str, owner: str, members: Iterable[str]) -> None:
    session.add(Circle(id=cid, owner_id=owner, name=cid.title()))
    session.add_all(CircleMember(circle_id=cid, user_id=m) for m in members)


def mark_row(
    session: Session,
    mid: str,
    *,
    name: str | None = None,
    category: Category = "coffee",
    lat: float = 32.98,
    lng: float = -96.75,
    vibe_tags: Iterable[str] = (),
) -> Mark:
    row = Mark(
        id=mid,
        name=name or mid.title(),
        category=category,
        lat=lat,
        lng=lng,
        vibe_tags=list(vibe_tags),
    )
    session.add(row)
    return row


def saved(session: Session, uid: str, mid: str, *, at: datetime = T0) -> None:
    session.add(SavedMark(user_id=uid, mark_id=mid, saved_at=at))


def hangout(
    session: Session,
    a: str,
    b: str,
    *,
    move_id: str,
    at: datetime,
    mark_id: str = "kumo",
    category: Category = "coffee",
    hour_bucket: str = "afternoon",
) -> None:
    x, y = sorted((a, b))
    session.add(
        Hangout(
            user_a=x,
            user_b=y,
            move_id=move_id,
            mark_id=mark_id,
            category=category,
            weekday=at.weekday(),
            hour_bucket=hour_bucket,
            at=at,
        )
    )


def group_hangout(
    session: Session, people: Iterable[str], *, move_id: str, at: datetime, **kw: object
) -> None:
    people = sorted(people)
    for i, a in enumerate(people):
        for b in people[i + 1 :]:
            hangout(session, a, b, move_id=move_id, at=at, **kw)


def mark_snap(
    mid: str = "kumo",
    *,
    name: str | None = None,
    category: Category = "coffee",
    lat: float = 32.98,
    lng: float = -96.75,
    vibe_tags: tuple[str, ...] = (),
) -> MarkSnapshot:
    return MarkSnapshot(
        mid, name or mid.title(), category, lat, lng, "", vibe_tags=vibe_tags
    )


def move_snap(
    mid: str,
    creator: str,
    *,
    mark: MarkSnapshot | None = None,
    text: str = "getting matcha",
    category: Category = "coffee",
    kind: str = "move",
    open: bool = False,
    created_at: datetime = T0,
    fill_deadline: datetime | None = None,
    there: Iterable[str] = (),
    going: Iterable[str] = (),
    notify_user_ids: tuple[str, ...] | None = None,
) -> MoveSnapshot:
    parts = [ParticipantSnapshot(creator, "there", "creator", created_at)]
    parts += [ParticipantSnapshot(u, "there", "tap", created_at) for u in there]
    parts += [ParticipantSnapshot(u, "going", "tap", created_at) for u in going]
    return MoveSnapshot(
        id=mid,
        creator_id=creator,
        mark=mark or mark_snap(category=category),
        text=text,
        category=category,
        status="live",
        kind=kind,
        open=open,
        origin="manual",
        starts_at=created_at,
        created_at=created_at,
        participants=tuple(parts),
        fill_deadline=fill_deadline,
        notify_user_ids=notify_user_ids,
    )


def lane(
    engine, container: Container, client: FakeMuseClient | None = None
) -> MuseLane:
    return MuseLane.build(engine, container, client or FakeMuseClient())


def days(n: float) -> timedelta:
    return timedelta(days=n)


def wire(engine, clock, client: FakeMuseClient | None = None, **ports):
    """Register the real muse lane on a fresh Container with fake foreign ports.

    Returns `(container, hooks, scheduler, lane)`.
    """
    from app.hooks import Hooks
    from app.lanes import muse as muse_lane
    from app.scheduler.loop import Scheduler

    container = Container(clock=clock, **ports)
    hooks, scheduler = Hooks(), Scheduler()
    lane = muse_lane.register(
        container, hooks, scheduler, engine=engine, client=client or FakeMuseClient()
    )
    return container, hooks, scheduler, lane


def make_app(engine, clock, client: FakeMuseClient | None = None, **ports):
    """A FastAPI app with only the muse lane registered, on the test engine.

    Returns `(app, state)`; `state["lane"]` is set once the app starts.
    """
    from app.core import db
    from app.lanes import muse as muse_lane
    from app.main import create_app

    state: dict = {}

    def registrar(container, hooks, scheduler):
        container.clock = clock
        for name, port in ports.items():
            setattr(container, name, port)
        state["lane"] = muse_lane.register(
            container,
            hooks,
            scheduler,
            engine=engine,
            client=client or FakeMuseClient(),
        )

    def session_override():
        with Session(engine) as session:
            yield session

    app = create_app(lanes=(registrar,))
    app.dependency_overrides[db.get_session] = session_override
    return app, state
