"""Application layer for notes: the use cases.

A service method is one thing the user can *do*. It orchestrates the domain
(rules) and the repository (storage) and is where transactions, authorization
checks, and cross-entity logic would go as the app grows.

Note what is absent: no `Request`, no `HTTPException`, no status codes. The
service raises domain errors (`NoteNotFound`, `InvalidNote`) and lets the HTTP
layer decide how to present them. That is what makes this class trivially
testable without a web server (see backend/tests/test_notes.py).

Dependencies (`repository`, `clock`) are passed in through the constructor, a
pattern called dependency injection. Production wiring happens once, in
`app/api/deps.py`; tests pass fakes directly.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID, uuid4

from app.domain.notes import Note, NoteNotFound, validate_title
from app.repositories.notes import NoteRepository


class NoteService:
    def __init__(
        self,
        repository: NoteRepository,
        clock: Callable[[], datetime],
    ) -> None:
        self._repository = repository
        self._clock = clock

    def create(self, title: str, body: str) -> Note:
        note = Note(
            id=uuid4(),
            title=validate_title(title),
            body=body,
            created_at=self._clock(),
        )
        self._repository.add(note)
        return note

    def list(self) -> list[Note]:
        return self._repository.list()

    def get(self, note_id: UUID) -> Note:
        note = self._repository.get(note_id)
        if note is None:
            raise NoteNotFound(note_id)
        return note

    def delete(self, note_id: UUID) -> None:
        if not self._repository.delete(note_id):
            raise NoteNotFound(note_id)
