"""Fixtures shared by every lane: a fresh in-memory database per test.

`StaticPool` keeps the single in-memory connection alive for the engine's
life, so every session in a test sees the same database, and nothing leaks
into the next test. `DB_PATH` is forced to memory before any test module
imports the app, so tests that boot the whole app never touch `data/app.db`.
"""

import os
import tempfile
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.tables import metadata


def pytest_configure() -> None:
    os.environ["DB_PATH"] = ":memory:"
    os.environ["MEDIA_DIR"] = tempfile.mkdtemp(prefix="hackmeta-test-media-")


@pytest.fixture
def engine() -> Iterator[Engine]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
