"""Repository layer for notes: the *port* and its *adapters*.

Clean architecture calls the interface a "port" and each implementation an
"adapter". The service layer talks only to the port (`NoteRepository`), so the
storage technology can change without touching business logic.

Today there is a single adapter, `InMemoryNoteRepository`, which keeps the
template runnable with no database. When you add Postgres, write a
`SqlNoteRepository` next to it that satisfies the same Protocol, then swap the
one line in `app/api/deps.py` that chooses the adapter. Nothing in
`app/services/` or `app/api/routes/` changes.
"""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.domain.notes import Note


class NoteRepository(Protocol):
    """What the application needs from storage, and nothing more.

    A `Protocol` is structural: any class with these methods satisfies it, no
    inheritance required. That keeps adapters decoupled from this module too.
    """

    def add(self, note: Note) -> None: ...

    def get(self, note_id: UUID) -> Note | None: ...

    def list(self) -> list[Note]: ...

    def delete(self, note_id: UUID) -> bool:
        """Remove the note; return False when it did not exist."""
        ...


class InMemoryNoteRepository:
    """Adapter backed by a dict. Process-local, lost on restart; fine for tests
    and for a template that must run without infrastructure."""

    def __init__(self) -> None:
        self._notes: dict[UUID, Note] = {}

    def add(self, note: Note) -> None:
        self._notes[note.id] = note

    def get(self, note_id: UUID) -> Note | None:
        return self._notes.get(note_id)

    def list(self) -> list[Note]:
        return sorted(self._notes.values(), key=lambda n: n.created_at)

    def delete(self, note_id: UUID) -> bool:
        return self._notes.pop(note_id, None) is not None
