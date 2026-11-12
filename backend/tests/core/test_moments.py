"""C8: Moments upload, tags, approval flow, visibility and media serving."""

import asyncio
import io
from collections.abc import Coroutine, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.api.routes.moments import get_media_dir
from app.core import db
from app.domain.errors import MoveNotFound, MoveNotLive
from app.hooks import Hooks
from app.main import create_app
from app.ports import MoveCreate
from app.services.moments import (
    InvalidMoment,
    MomentNotFound,
    MomentService,
    NotMoveParticipant,
    NotTagged,
    moment_status,
)
from app.services.moves import MoveService
from app.tables import Block, Mark, Moment, MomentTag, User
from tests.core.fakes import FixedClock, RecordingPublisher

T0 = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 60
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 60
MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 60

# ana creates the Move for bo, cy, dee, mom; bo, cy and mom join; dee only sees
# it; zed is outside the audience. Then ana blocks mom.
USERS = ("ana", "bo", "cy", "dee", "mom", "zed")


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro)


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str, str, dict[str, str]]] = []

    async def send(
        self, user_id: str, type: str, title: str, body: str, data: dict[str, str]
    ) -> str:
        self.sent.append((user_id, type, title, body, data))
        return f"n{len(self.sent)}"


class FailingNotifier:
    async def send(self, *args: Any) -> str:
        raise RuntimeError("down")


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(T0)


@pytest.fixture
def events() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def notifier() -> RecordingNotifier:
    return RecordingNotifier()


@pytest.fixture
def move_id(session: Session, clock: FixedClock) -> str:
    session.add_all(
        User(id=u, name=u.title(), first_name=u.title(), created_at=T0) for u in USERS
    )
    session.add(
        Mark(id="kumo", name="Kumo", category="coffee", lat=1, lng=2, address="x")
    )
    session.commit()
    moves = MoveService(session, clock, RecordingPublisher(), Hooks())
    draft = MoveCreate(
        mark_id="kumo",
        text="matcha",
        category="coffee",
        user_ids=("bo", "cy", "dee", "mom"),
    )
    move = run(moves.create("ana", draft))
    for user in ("bo", "cy", "mom"):
        run(moves.join(user, move.id))
    session.add(Block(user_id="ana", hidden_from_user_id="mom"))
    session.commit()
    return move.id


@pytest.fixture
def media_dir(tmp_path: Path) -> Path:
    return tmp_path / "uploads"


@pytest.fixture
def service(
    session: Session,
    clock: FixedClock,
    events: RecordingPublisher,
    notifier: RecordingNotifier,
    media_dir: Path,
) -> MomentService:
    return MomentService(session, clock, events, notifier, media_dir, max_bytes=1024)


def upload(
    service: MomentService,
    move_id: str,
    author: str = "bo",
    tags: tuple[str, ...] = (),
    data: bytes = JPEG,
    content_type: str = "image/jpeg",
    caption: str = " first one ",
) -> str:
    view = run(
        service.upload(author, move_id, io.BytesIO(data), content_type, caption, tags)
    )
    return view.moment.id


def visible_ids(service: MomentService, viewer: str, move_id: str) -> list[str]:
    return [v.moment.id for v in service.list_for_move(viewer, move_id)]


# --- Rules -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("answers", "status"),
    [
        ((), "approved"),
        ((None,), "pending"),
        ((True,), "approved"),
        ((False,), "pending"),
        ((True, None), "pending"),
        ((True, False), "pending"),
        ((True, True, True), "approved"),
    ],
)
def test_moment_status(answers: tuple[bool | None, ...], status: str) -> None:
    assert moment_status(answers) == status


# --- Upload ------------------------------------------------------------------


def test_upload_stores_file_row_and_tags(
    service: MomentService, session: Session, media_dir: Path, move_id: str
) -> None:
    moment_id = upload(service, move_id, tags=("cy", "bo", "cy"))

    moment = session.get(Moment, moment_id)
    assert moment is not None
    assert (moment.mark_id, moment.author_id, moment.caption) == (
        "kumo",
        "bo",
        "first one",
    )
    assert (moment.media_type, moment.status, moment.created_at) == (
        "photo",
        "pending",
        T0,
    )
    assert moment.media_url == f"/media/{moment_id}.jpg"
    assert (media_dir / f"{moment_id}.jpg").read_bytes() == JPEG
    tags = session.exec(select(MomentTag.user_id, MomentTag.approved)).all()
    assert tags == [("cy", None)]  # deduplicated, author dropped


def test_upload_detects_clip(service: MomentService, session: Session, move_id: str):
    moment_id = upload(service, move_id, data=MP4, content_type="video/mp4")
    moment = session.get(Moment, moment_id)
    assert moment is not None
    assert (moment.media_type, moment.media_url[-4:]) == ("clip", ".mp4")


@pytest.mark.parametrize(
    ("data", "content_type"),
    [
        (JPEG, "application/pdf"),
        (JPEG, None),
        (b"", "image/jpeg"),
        (b"<html>", "image/jpeg"),
        (MP4, "image/jpeg"),
        (JPEG + b"\x00" * 1024, "image/jpeg"),
    ],
)
def test_upload_rejects_bad_media(
    service: MomentService,
    session: Session,
    media_dir: Path,
    move_id: str,
    data: bytes,
    content_type: str | None,
) -> None:
    with pytest.raises(InvalidMoment):
        run(service.upload("bo", move_id, io.BytesIO(data), content_type))
    assert session.exec(select(Moment)).all() == []
    assert not media_dir.exists() or not any(media_dir.iterdir())


def test_upload_accepts_png_declared_as_any_photo_type(
    service: MomentService, session: Session, move_id: str
) -> None:
    moment = session.get(Moment, upload(service, move_id, data=PNG))
    assert moment is not None and moment.media_url.endswith(".png")


def test_upload_rejects_long_caption_and_outside_tags(
    service: MomentService, move_id: str
) -> None:
    with pytest.raises(InvalidMoment):
        upload(service, move_id, caption="x" * 281)
    with pytest.raises(InvalidMoment):
        upload(service, move_id, tags=("dee",))  # audience, not a participant


@pytest.mark.parametrize(
    ("author", "error"),
    [("dee", NotMoveParticipant), ("zed", MoveNotFound), ("mom", MoveNotFound)],
)
def test_only_visible_participants_upload(
    service: MomentService, move_id: str, author: str, error: type[Exception]
) -> None:
    with pytest.raises(error):
        upload(service, move_id, author=author)


def test_no_uploads_after_the_move_ends(
    service: MomentService, session: Session, clock: FixedClock, move_id: str
) -> None:
    run(MoveService(session, clock, RecordingPublisher(), Hooks()).end("ana", move_id))
    with pytest.raises(MoveNotLive):
        upload(service, move_id)


# --- Approval and visibility ------------------------------------------------


def test_untagged_moment_is_approved_and_visible_to_audience(
    service: MomentService, move_id: str
) -> None:
    moment_id = upload(service, move_id)
    for viewer in ("ana", "bo", "cy", "dee"):
        assert visible_ids(service, viewer, move_id) == [moment_id]


def test_pending_moment_is_only_for_participants(
    service: MomentService, move_id: str
) -> None:
    moment_id = upload(service, move_id, tags=("cy",))

    for viewer in ("ana", "bo", "cy"):
        assert visible_ids(service, viewer, move_id) == [moment_id]
    assert visible_ids(service, "dee", move_id) == []
    with pytest.raises(MomentNotFound):
        service.get("dee", moment_id)


def test_approval_with_many_tags(service: MomentService, move_id: str) -> None:
    moment_id = upload(service, move_id, author="ana", tags=("bo", "cy"))

    assert run(service.answer("bo", moment_id, True)).moment.status == "pending"
    assert visible_ids(service, "dee", move_id) == []
    view = run(service.answer("cy", moment_id, True))
    assert view.moment.status == "approved"
    assert [(u.id, a) for u, a in view.tags] == [("bo", True), ("cy", True)]
    assert visible_ids(service, "dee", move_id) == [moment_id]


def test_decline_keeps_it_pending_and_consent_can_be_withdrawn(
    service: MomentService, move_id: str
) -> None:
    moment_id = upload(service, move_id, tags=("cy",))

    assert run(service.answer("cy", moment_id, False)).moment.status == "pending"
    assert visible_ids(service, "dee", move_id) == []
    run(service.answer("cy", moment_id, True))
    assert visible_ids(service, "dee", move_id) == [moment_id]
    run(service.answer("cy", moment_id, False))
    assert visible_ids(service, "dee", move_id) == []


def test_only_tagged_users_answer(service: MomentService, move_id: str) -> None:
    moment_id = upload(service, move_id, tags=("cy",))
    with pytest.raises(NotTagged):
        run(service.answer("ana", moment_id, True))
    with pytest.raises(MomentNotFound):
        run(service.answer("dee", moment_id, True))  # cannot even see it


@pytest.mark.parametrize("viewer", ["zed", "mom"])
def test_strangers_and_blocked_users_see_nothing(
    service: MomentService, move_id: str, viewer: str
) -> None:
    moment_id = upload(service, move_id)  # approved, so audience-visible
    with pytest.raises(MoveNotFound):
        service.list_for_move(viewer, move_id)
    with pytest.raises(MomentNotFound):
        service.get(viewer, moment_id)
    with pytest.raises(MomentNotFound):
        service.media(viewer, f"{moment_id}.jpg")


def test_media_follows_moment_visibility(
    service: MomentService, media_dir: Path, move_id: str
) -> None:
    moment_id = upload(service, move_id, tags=("cy",))
    name = f"{moment_id}.jpg"

    assert service.media("cy", name).path == media_dir / name
    assert service.media("cy", name).content_type == "image/jpeg"
    with pytest.raises(MomentNotFound):
        service.media("dee", name)
    for bad in (f"{moment_id}.png", "../app.db", f"{moment_id}.jpg/x", "nope.jpg"):
        with pytest.raises(MomentNotFound):
            service.media("cy", bad)


# --- Side effects -------------------------------------------------------------


def test_events_and_notifications(
    service: MomentService,
    events: RecordingPublisher,
    notifier: RecordingNotifier,
    move_id: str,
) -> None:
    moment_id = upload(service, move_id, tags=("cy", "ana"))
    ref = {"moment_id": moment_id, "move_id": move_id}

    assert events.of_type("moment.added") == [
        (frozenset({"ana", "bo", "cy"}), {**ref, "status": "pending"})
    ]
    assert events.of_type("moment.approval_needed") == [(frozenset({"ana", "cy"}), ref)]
    assert sorted(notifier.sent) == [
        (u, "moment_approval", "Bo tagged you in a moment", "OK to share?", ref)
        for u in ("ana", "cy")
    ]

    events.published.clear()
    run(service.answer("cy", moment_id, True))
    assert events.published == []
    run(service.answer("ana", moment_id, True))
    assert events.of_type("moment.added") == [
        (frozenset({"dee"}), {**ref, "status": "approved"})
    ]


def test_untagged_upload_announces_to_whole_audience_only(
    service: MomentService,
    events: RecordingPublisher,
    notifier: RecordingNotifier,
    move_id: str,
) -> None:
    upload(service, move_id)
    assert [users for users, _, _ in events.published] == [
        frozenset({"ana", "bo", "cy", "dee"})
    ]
    assert notifier.sent == []


def test_failing_notifier_does_not_fail_upload(
    session: Session, clock: FixedClock, media_dir: Path, move_id: str
) -> None:
    service = MomentService(
        session, clock, RecordingPublisher(), FailingNotifier(), media_dir
    )
    moment_id = upload(service, move_id, tags=("cy",))
    assert session.get(Moment, moment_id) is not None


# --- HTTP ----------------------------------------------------------------------


@pytest.fixture
def client(
    engine: Engine,
    move_id: str,
    media_dir: Path,
    events: RecordingPublisher,
    notifier: RecordingNotifier,
    clock: FixedClock,
) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    app.dependency_overrides[get_media_dir] = lambda: media_dir
    with TestClient(app) as client:
        container = app.state.container
        container.clock, container.events, container.notifier = clock, events, notifier
        yield client


def as_user(user: str) -> dict[str, str]:
    return {"X-User-Id": user}


def test_http_upload_approve_list_and_media(
    client: TestClient, move_id: str, notifier: RecordingNotifier
) -> None:
    res = client.post(
        f"/api/v1/moves/{move_id}/moments",
        headers=as_user("bo"),
        files={"file": ("pic.jpg", JPEG, "image/jpeg")},
        data={"caption": "kumo!", "tagged_user_ids": ["cy", "ana"]},
    )
    assert res.status_code == 201, res.text
    moment = res.json()
    assert moment["status"] == "pending"
    assert moment["author"]["id"] == "bo"
    assert [(t["user"]["id"], t["approved"]) for t in moment["tags"]] == [
        ("ana", None),
        ("cy", None),
    ]
    assert moment["media_url"] == f"/api/v1/media/{moment['id']}.jpg"
    assert len(notifier.sent) == 2

    media = client.get(moment["media_url"], headers=as_user("cy"))
    assert media.status_code == 200
    assert media.content == JPEG
    assert media.headers["content-type"] == "image/jpeg"
    assert client.get(moment["media_url"], headers=as_user("dee")).status_code == 404
    assert client.get(moment["media_url"]).status_code == 401
    listed = client.get(f"/api/v1/moves/{move_id}/moments", headers=as_user("dee"))
    assert listed.json() == []

    for user in ("cy", "ana"):
        res = client.post(
            f"/api/v1/moments/{moment['id']}/approve",
            headers=as_user(user),
            json={"approve": True},
        )
        assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"
    listed = client.get(f"/api/v1/moves/{move_id}/moments", headers=as_user("dee"))
    assert [m["id"] for m in listed.json()] == [moment["id"]]
    assert client.get(moment["media_url"], headers=as_user("dee")).status_code == 200
    assert client.get(moment["media_url"], headers=as_user("mom")).status_code == 404


@pytest.mark.parametrize(
    ("user", "files", "code"),
    [
        ("dee", {"file": ("a.jpg", JPEG, "image/jpeg")}, 403),
        ("zed", {"file": ("a.jpg", JPEG, "image/jpeg")}, 404),
        ("bo", {"file": ("a.txt", b"hello", "text/plain")}, 422),
        ("bo", None, 422),
    ],
)
def test_http_upload_errors(
    client: TestClient,
    move_id: str,
    user: str,
    files: dict[str, tuple[str, bytes, str]] | None,
    code: int,
) -> None:
    res = client.post(
        f"/api/v1/moves/{move_id}/moments", headers=as_user(user), files=files
    )
    assert res.status_code == code, res.text


def test_http_approve_errors(client: TestClient, move_id: str) -> None:
    res = client.post(
        f"/api/v1/moves/{move_id}/moments",
        headers=as_user("bo"),
        files={"file": ("pic.jpg", JPEG, "image/jpeg")},
        data={"tagged_user_ids": "cy"},
    )
    moment_id = res.json()["id"]
    url = f"/api/v1/moments/{moment_id}/approve"
    body = {"approve": True}
    assert client.post(url, headers=as_user("ana"), json=body).status_code == 403
    assert client.post(url, headers=as_user("dee"), json=body).status_code == 404
    assert client.post(url, headers=as_user("cy"), json={}).status_code == 422
