"""Shared FastAPI dependencies: the composition root.

This is the one place that knows which concrete adapter backs each port.
Routes ask for a `NoteService` and never learn what storage it uses.

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

from app.repositories.notes import InMemoryNoteRepository, NoteRepository
from app.services.notes import NoteService


@lru_cache
def get_note_repository() -> NoteRepository:
    return InMemoryNoteRepository()


def get_note_service(
    repository: Annotated[NoteRepository, Depends(get_note_repository)],
) -> NoteService:
    return NoteService(repository)


NoteServiceDep = Annotated[NoteService, Depends(get_note_service)]
