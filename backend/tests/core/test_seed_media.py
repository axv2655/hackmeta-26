"""Seed imagery: bundled, offline, and still subject to approval."""

import socket
from collections.abc import Iterator
from importlib import resources
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.core.config import settings
from app.main import create_app
from app.seed import ids
from app.seed import media as seed_media
from app.tables import Mark, Moment
from tests.core.test_seed_core import seed

PNG = b"\x89PNG\r\n\x1a\n"


@pytest.fixture
def media_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "MEDIA_DIR", str(path))
    return path


@pytest.fixture
def client(engine: Engine, media_dir: Path) -> Iterator[TestClient]:
    seed(engine)

    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        yield client


def as_user(user: str) -> dict[str, str]:
    return {"X-User-Id": user}


def test_seed_assets_available_from_installed_package() -> None:
    root = resources.files("app.seed").joinpath("assets")
    manifest = seed_media.manifest()
    paths = [*manifest["marks"].values(), *manifest["moments"].values()]
    assert len(paths) >= 15
    for relative in paths:
        data = root.joinpath(relative).read_bytes()
        assert data.startswith(PNG) and len(data) > 5_000  # a real picture
    for category in ("food", "coffee", "study", "other"):
        assert category in manifest["marks"]


def test_seed_media_is_offline_and_authorized(
    client: TestClient,
    engine: Engine,
    media_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def no_network(*_: object, **__: object) -> None:
        raise AssertionError("seed media must not touch the network")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    with Session(engine) as session:
        urls = [m.photo_url for m in session.exec(select(Mark)).all()]
        moments = session.exec(select(Moment)).all()
    assert urls and all(u and u.startswith("/media/seed/marks/") for u in urls)
    assert moments and all(m.media_url.startswith("/media/") for m in moments)

    for url in urls:  # public Mark photos need no sign-in
        res = client.get(url)
        assert res.status_code == 200 and res.content.startswith(PNG)

    by_id = {m.id: m for m in moments}
    approved = by_id["mo_last_night_sunset"].media_url
    pending = by_id["mo_last_night_candid"].media_url  # waiting on Priya
    assert client.get(approved).status_code == 401
    assert client.get(approved, headers=as_user(ids.ANISH)).content.startswith(PNG)
    assert client.get(pending, headers=as_user(ids.PRIYA)).status_code == 200
    assert client.get(pending, headers=as_user(ids.TONY)).status_code == 200
    assert client.get(pending, headers=as_user(ids.ANISH)).status_code == 404
    assert client.get(pending, headers=as_user(ids.MOM)).status_code == 404
    legacy = f"/api/v1{pending}"
    assert client.get(legacy, headers=as_user(ids.ANISH)).status_code == 404


@pytest.mark.parametrize(
    "name",
    ["../coffee.png", "..%2Fcoffee.png", "mo_last_night_sunset.png", "x.png", "%2e%2e"],
)
def test_public_mark_route_cannot_reach_anything_else(
    client: TestClient, name: str
) -> None:
    assert client.get(f"/media/seed/marks/{name}").status_code in (404, 405)


def test_reseed_keeps_unrelated_uploads(
    engine: Engine, media_dir: Path, session: Session
) -> None:
    seed(engine)
    upload = media_dir / "deadbeef0001.jpg"
    upload.write_bytes(b"someone's real upload")
    seeded = media_dir / "mo_last_night_sunset.png"
    seeded.write_bytes(b"stale")

    db.reset(engine)
    seed(engine)

    assert upload.read_bytes() == b"someone's real upload"
    assert seeded.read_bytes().startswith(PNG)  # seed-owned file refreshed
