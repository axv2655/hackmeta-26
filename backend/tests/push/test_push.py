"""APNs push: the JWT, the request, dead-token cleanup, and the routes."""

from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.main import create_app
from app.push.apns import ApnsClient, ApnsResult, alert_payload
from app.services.push import ApnsPushSender, PushTokens
from app.tables import PushToken, User

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)
TOKEN_A = "a" * 64
TOKEN_B = "b" * 64


class Clock:
    def now(self) -> datetime:
        return NOW


@pytest.fixture
def key() -> tuple[str, ec.EllipticCurvePublicKey]:
    private = ec.generate_private_key(ec.SECP256R1())
    pem = private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return pem, private.public_key()


def apns(key_pem: str, handler) -> ApnsClient:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return ApnsClient(key_pem, "KEY123", "TEAM45", "com.example.app", client=client)


def test_bearer_is_es256_with_kid_and_is_reused(key):
    pem, public = key
    client = ApnsClient(pem, "KEY123", "TEAM45", "com.example.app", now=lambda: 1000.0)
    token = client.bearer()
    assert jwt.get_unverified_header(token)["kid"] == "KEY123"
    claims = jwt.decode(token, public, algorithms=["ES256"])
    assert claims == {"iss": "TEAM45", "iat": 1000}
    assert client.bearer() is token


@pytest.mark.anyio
async def test_send_posts_to_the_sandbox_with_topic(key):
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    result = await apns(key[0], handler).send(TOKEN_A, {"aps": {}}, sandbox=True)
    assert result == ApnsResult(200)
    req = seen[0]
    assert str(req.url) == f"https://api.sandbox.push.apple.com/3/device/{TOKEN_A}"
    assert req.headers["apns-topic"] == "com.example.app"
    assert req.headers["authorization"].startswith("bearer ")


@pytest.mark.anyio
async def test_sender_pushes_each_token_and_forgets_dead_ones(
    key, engine: Engine, session
):
    session.add(User(id="u_ana", name="Ana", first_name="Ana", created_at=NOW))
    session.commit()
    tokens = PushTokens(session, Clock())
    tokens.register("u_ana", TOKEN_A, sandbox=True)
    tokens.register("u_ana", TOKEN_B, sandbox=True)
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request.url.path.rsplit("/", 1)[-1])
        if TOKEN_B in request.url.path:
            return httpx.Response(410, json={"reason": "Unregistered"})
        return httpx.Response(200)

    sender = ApnsPushSender(engine, apns(key[0], handler))
    await sender.push(["u_ana"], "Maya's Move", "pull up?", {"move_id": "m1"})
    assert sorted(sent) == [TOKEN_A, TOKEN_B]
    with Session(engine) as s:
        assert [t.token for t in s.exec(select(PushToken)).all()] == [TOKEN_A]


@pytest.mark.anyio
async def test_sender_never_raises(key, engine: Engine):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    sender = ApnsPushSender(engine, apns(key[0], handler))
    await sender.push(["nobody"], "t", "b", {})  # no table rows, no error


def test_payload_puts_the_alert_in_aps_and_data_on_top():
    payload = alert_payload("Title", "Body", {"move_id": "m1"})
    assert payload == {
        "aps": {"alert": {"title": "Title", "body": "Body"}, "sound": "default"},
        "move_id": "m1",
    }


def test_token_moves_to_whoever_registered_it_last(session):
    session.add_all(
        [
            User(id="u_ana", name="Ana", first_name="Ana", created_at=NOW),
            User(id="u_bo", name="Bo", first_name="Bo", created_at=NOW),
        ]
    )
    session.commit()
    tokens = PushTokens(session, Clock())
    tokens.register("u_ana", TOKEN_A.upper(), sandbox=True)
    tokens.register("u_bo", TOKEN_A, sandbox=False)
    row = session.get(PushToken, TOKEN_A)
    assert (row.user_id, row.sandbox) == ("u_bo", False)
    tokens.unregister("u_ana", TOKEN_A)  # not Ana's any more: kept
    assert session.get(PushToken, TOKEN_A) is not None
    tokens.unregister("u_bo", TOKEN_A)
    assert session.get(PushToken, TOKEN_A) is None


def test_http_register_and_drop(engine: Engine, session: Session):
    session.add(User(id="u_ana", name="Ana", first_name="Ana", created_at=NOW))
    session.commit()

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    me = {"X-User-Id": "u_ana"}
    with TestClient(app) as client:
        url = "/api/v1/me/push-tokens"
        assert client.post(url, json={"token": TOKEN_A}).status_code == 401
        assert (
            client.post(url, json={"token": "nothex!"}, headers=me).status_code == 422
        )
        assert client.post(url, json={"token": TOKEN_A}, headers=me).status_code == 204
        with Session(engine) as s:
            assert s.get(PushToken, TOKEN_A).user_id == "u_ana"
        assert client.delete(f"{url}/{TOKEN_A}", headers=me).status_code == 204
        with Session(engine) as s:
            assert s.get(PushToken, TOKEN_A) is None
