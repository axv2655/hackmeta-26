"""Database engine, per-request sessions and schema helpers (ARCHITECTURE.md 3.1).

Which database (`database_target`):
  * `DB_PATH=":memory:"`: a throwaway in-process SQLite (the test suite forces
    this, so tests never touch a shared database).
  * `DATABASE_URL` set: that database. `postgres://` / `postgresql://` URLs
    (Timescale, Neon, a Postgres container) use the psycopg driver.
  * Otherwise the SQLite file at `DB_PATH` (local dev with no `.env`).

Tables come from `app.tables`; this module only connects to them. Services
that run outside a request (gateways, scheduler jobs) open their own
`Session(engine)`; route handlers take `SessionDep`.
"""

from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.core.config import settings
from app.tables import metadata

MEMORY = ":memory:"


POSTGRES_SCHEMES = ("postgres://", "postgresql://", "postgresql+psycopg://")


def postgres_url(url: str) -> str:
    """Any Postgres URL with the psycopg (v3) driver SQLAlchemy should use."""
    for scheme in POSTGRES_SCHEMES:
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url[len(scheme) :]
    raise ValueError("not a Postgres URL")


def make_engine(target: str) -> Engine:
    """Engine for MEMORY, a SQLite file path or URL, or a Postgres URL."""
    if target.startswith(POSTGRES_SCHEMES):
        # pre_ping: hosted Postgres drops idle connections.
        return create_engine(postgres_url(target), pool_pre_ping=True, pool_recycle=300)
    connect_args = {"check_same_thread": False}
    if target in (MEMORY, "sqlite://"):
        return create_engine(
            "sqlite://", connect_args=connect_args, poolclass=StaticPool
        )
    url = target if target.startswith("sqlite:") else f"sqlite:///{target}"
    return create_engine(url, connect_args=connect_args)


def database_target(db_path: str, database_url: str | None) -> str:
    """What `make_engine` connects to; see the module docstring for the order."""
    if db_path == MEMORY or not database_url:
        return db_path
    return database_url


engine = make_engine(
    database_target(
        settings.DB_PATH,
        settings.DATABASE_URL.get_secret_value() if settings.DATABASE_URL else None,
    )
)


def _ensure_folder(engine: Engine) -> None:
    if engine.url.get_backend_name() != "sqlite":
        return
    database = engine.url.database
    if database and database != MEMORY:
        Path(database).parent.mkdir(parents=True, exist_ok=True)


def create_all(engine: Engine) -> None:
    """Create any missing tables (and the database's folder). Idempotent."""
    _ensure_folder(engine)
    metadata.create_all(engine)


def reset(engine: Engine) -> None:
    """Drop every table and recreate it empty. Used before seeding."""
    _ensure_folder(engine)
    metadata.drop_all(engine)
    metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
