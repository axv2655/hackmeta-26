"""HTTP round trips: the invite API and the public /m/{token} page."""

from collections.abc import Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.main import create_app
from tests.messages.fakes import (
    FakeMoves,
    FixedClock,
    RecordingNotifier,
    add_world,
    kumo_move,
)

PREVIEW_UA = "Mozilla/5.0 facebookexternalhit/1.1 Facebot Twitterbot/1.0"
HOST = "http://moves.test"


@pytest.fixture
def client(engine: Engine, session: Session) -> Iterator[TestClient]:
    add_world(session)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app, base_url=HOST) as client:
        c = app.state.container
        c.clock = FixedClock()
        c.moves = FakeMoves(
            moves={"m1": kumo_move(participants=("ana", "bo"))},
            audiences={"m1": frozenset({"bo"})},
        )
        c.notifier = RecordingNotifier()
        client.headers["X-User-Id"] = "ana"
        yield client


def share(client: TestClient, **body) -> dict:
    response = client.post("/api/v1/moves/m1/invites", json=body or None)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_list(client: TestClient) -> None:
    link = share(client)
    assert link["url"].startswith(f"{HOST}/m/")
    assert link["body"] == f"{link['text']}\n{link['url']}"
    assert share(client, message="pull up rn")["text"] == "pull up rn"
    listed = client.get("/api/v1/moves/m1/invites").json()
    assert [i["id"] for i in listed][0] == link["id"] and len(listed) == 2


def test_errors_map_to_statuses(client: TestClient) -> None:
    post = client.post
    stranger = {"X-User-Id": "dee"}
    assert post("/api/v1/moves/m1/invites", headers=stranger).status_code == 403
    assert post("/api/v1/moves/zz/invites").status_code == 409
    too_long = {"message": "x" * 400}
    assert post("/api/v1/moves/m1/invites", json=too_long).status_code == 422
    no_user = {"X-User-Id": ""}
    assert post("/api/v1/moves/m1/invites", headers=no_user).status_code == 401


def test_public_page_and_guest_going(client: TestClient) -> None:
    path = share(client)["url"].removeprefix(HOST)
    client.headers.pop("X-User-Id")

    preview = client.get(path, headers={"User-Agent": PREVIEW_UA})
    assert preview.status_code == 200
    title = 'property="og:title" content="Ana is making a move to Kumo Matcha"'
    assert title in preview.text
    assert preview.headers["x-robots-tag"] == "noindex"

    page = client.get(path)
    assert "matcha + PSET" in page.text
    assert "Ana is there or on the way, +1 other going" in page.text
    assert "Bo" not in page.text  # other participants are counted, never named

    going = client.post(f"{path}/going", data={"name": "Sam"}, follow_redirects=False)
    assert going.status_code == 303
    after = client.get(going.headers["location"])
    assert "in, Sam" in after.text

    listed = client.get("/api/v1/moves/m1/invites", headers={"X-User-Id": "ana"})
    assert listed.json()[0]["open_count"] == 2
    assert listed.json()[0]["guest_name"] == "Sam"


def test_page_escapes_and_ends_with_the_move(client: TestClient) -> None:
    moves = client.app.state.container.moves
    moves.moves["m1"] = replace(
        kumo_move(participants=("ana",)), text="<script>alert(1)</script>"
    )
    path = share(client)["url"].removeprefix(HOST)
    assert "<script>alert" not in client.get(path).text
    moves.end("m1")
    ended = client.get(path)
    assert "wrapped up" in ended.text and "Kumo" not in ended.text
    assert client.get("/m/not-a-token").status_code == 404
