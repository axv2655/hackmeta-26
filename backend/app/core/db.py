"""SQLite engine, per-request sessions and schema helpers (ARCHITECTURE.md 3.1).

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


def make_engine(db_path: str) -> Engine:
    """File-backed engine, or a single shared in-memory connection for MEMORY."""
    connect_args = {"check_same_thread": False}
    if db_path == MEMORY:
        return create_engine(
            "sqlite://", connect_args=connect_args, poolclass=StaticPool
        )
    return create_engine(f"sqlite:///{db_path}", connect_args=connect_args)


engine = make_engine(settings.DB_PATH)


def _ensure_folder(engine: Engine) -> None:
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
