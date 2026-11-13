"""Sign up and log in: rules, the service, and one HTTP round trip."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core import db
from app.domain.accounts import (
    BadLogin,
    BadSignup,
    UsernameTaken,
    hash_password,
    password_matches,
)
from app.main import create_app
from app.services.accounts import AccountService
from app.tables import Credential, Friendship, User, UserSettings

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=UTC)


class Clock:
    def now(self) -> datetime:
        return NOW


@pytest.fixture
def accounts(session: Session) -> AccountService:
    session.add(
        User(id="u_tony", name="Tony Nguyen", first_name="Tony", created_at=NOW)
    )
    session.commit()
    return AccountService(session, Clock())


def test_hash_round_trip_and_never_plain():
    stored = hash_password("hunter2")
    assert "hunter2" not in stored
    assert password_matches("hunter2", stored)
    assert not password_matches("hunter3", stored)
    assert not password_matches("hunter2", "garbage")


def test_signup_makes_user_settings_credential_and_friends(accounts, session):
    user, username = accounts.signup("Ana Lopez", "@Ana_L", "pass1")
    assert (user.id, username, user.first_name) == ("u_ana_l", "ana_l", "Ana")
    assert session.get(UserSettings, user.id) is not None
    cred = session.exec(select(Credential)).one()
    assert cred.username == "ana_l" and cred.password_hash.startswith("scrypt$")
    pairs = session.exec(select(Friendship)).all()
    assert [(f.user_a, f.user_b) for f in pairs] == [("u_ana_l", "u_tony")]


def test_signup_rejects_taken_and_bad_input(accounts):
    accounts.signup("Ana", "ana", "pass1")
    with pytest.raises(UsernameTaken):
        accounts.signup("Other Ana", "ANA", "pass2")
    with pytest.raises(BadSignup):
        accounts.signup("", "bo", "pass1")
    with pytest.raises(BadSignup):
        accounts.signup("Bo", "bob", "123")


def test_signup_avoids_an_existing_user_id(accounts):
    user, _ = accounts.signup("Tony Two", "tony", "pass1")
    assert user.id != "u_tony"


def test_login_checks_the_password(accounts):
    accounts.signup("Ana", "ana", "pass1")
    user, _ = accounts.login(" @ANA ", "pass1")
    assert user.id == "u_ana"
    with pytest.raises(BadLogin):
        accounts.login("ana", "wrong")
    with pytest.raises(BadLogin):
        accounts.login("nobody", "pass1")


def test_http_signup_then_login(engine: Engine, session: Session):
    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        body = {"name": "Ana", "username": "ana", "password": "pass1"}
        made = client.post("/api/v1/auth/signup", json=body)
        assert made.status_code == 201
        assert made.json()["user"]["id"] == "u_ana"
        assert client.post("/api/v1/auth/signup", json=body).status_code == 409
        ok = client.post(
            "/api/v1/auth/login", json={"username": "ana", "password": "pass1"}
        )
        assert ok.json()["username"] == "ana"
        bad = client.post(
            "/api/v1/auth/login", json={"username": "ana", "password": "x"}
        )
        assert bad.status_code == 403
