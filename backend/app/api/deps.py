"""Shared FastAPI dependencies: the composition root.

This is the one place that knows which concrete adapter backs each port.
Routes ask for a `NoteService` and never learn what storage it uses.

Cross-lane ports live on the `Container` that `app/main.py` builds at startup
from each `app/lanes/<lane>.py`; routes reach them through `ContainerDep`.

Lifetimes:
  * `get_note_repository` is cached with `lru_cache`, so every request shares
    one in-memory store for the life of the process. A SQL adapter would
    instead be built per request around a session from `app/core/db.py`.
  * `get_note_service` is cheap and built per request.

Tests override these with `app.dependency_overrides` to inject a fresh
repository per test; see backend/tests/test_notes.py.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.container import Container
from app.hooks import Hooks
from app.repositories.notes import InMemoryNoteRepository, NoteRepository
from app.services.notes import NoteService


def get_container(conn: HTTPConnection) -> Container:
    """The ports the lanes registered at startup (see `app/main.py`)."""
    return conn.app.state.container


def get_hooks(conn: HTTPConnection) -> Hooks:
    return conn.app.state.hooks


ContainerDep = Annotated[Container, Depends(get_container)]
HooksDep = Annotated[Hooks, Depends(get_hooks)]


@lru_cache
def get_note_repository() -> NoteRepository:
    return InMemoryNoteRepository()


def get_note_service(
    repository: Annotated[NoteRepository, Depends(get_note_repository)],
) -> NoteService:
    return NoteService(repository)


NoteServiceDep = Annotated[NoteService, Depends(get_note_service)]
