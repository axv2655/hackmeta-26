"""Domain layer for notes.

This is the innermost ring. It knows nothing about HTTP, FastAPI, Pydantic
request bodies, or databases. It only knows what a Note *is* and which rules
every Note must satisfy. Everything else in the app depends on this module;
this module depends on nothing but the standard library.

Why a plain dataclass instead of a Pydantic model?
  Pydantic models in `app/models.py` describe the *wire format* (what the
  client sends and receives). That contract changes for reasons that have
  nothing to do with business rules (renaming a JSON field, adding a
  pagination wrapper). Keeping the entity separate means the rules below stay
  stable while the API evolves.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

MAX_TITLE_LENGTH = 120


class NoteError(Exception):
    """Base class for every domain error raised by this module."""


class InvalidNote(NoteError):
    """A Note violated one of its invariants (see `validate_title`)."""


class NoteNotFound(NoteError):
    """No Note exists with the requested id."""

    def __init__(self, note_id: UUID) -> None:
        super().__init__(f"note {note_id} not found")
        self.note_id = note_id


@dataclass(frozen=True, slots=True)
class Note:
    """A note the user has saved.

    `frozen=True` makes instances immutable, so a Note cannot drift into an
    invalid state after construction. To "change" a note, build a new one.
    """

    id: UUID
    title: str
    body: str
    created_at: datetime


def validate_title(title: str) -> str:
    """Return the normalized title or raise `InvalidNote`.

    Business rules live here, in one place, rather than being re-implemented
    in each route handler or (worse) in the frontend only.
    """
    normalized = title.strip()
    if not normalized:
        raise InvalidNote("title must not be blank")
    if len(normalized) > MAX_TITLE_LENGTH:
        raise InvalidNote(f"title must be at most {MAX_TITLE_LENGTH} characters")
    return normalized
