"""API schemas: the contract between the HTTP layer and clients.

These are deliberately separate from the domain entities in `app/domain/`.
Request schemas validate shape and types; the domain validates meaning. A
`from_domain` classmethod is the single seam where an entity becomes JSON.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.notes import MAX_TITLE_LENGTH, Note


class HealthResponse(BaseModel):
    status: Literal["ok"]


class NoteCreate(BaseModel):
    title: str = Field(max_length=MAX_TITLE_LENGTH, examples=["Buy snacks"])
    body: str = Field(default="", examples=["Enough for the whole team"])


class NoteRead(BaseModel):
    id: UUID
    title: str
    body: str
    created_at: datetime

    @classmethod
    def from_domain(cls, note: Note) -> "NoteRead":
        return cls(
            id=note.id,
            title=note.title,
            body=note.body,
            created_at=note.created_at,
        )
