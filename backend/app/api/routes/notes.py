"""HTTP layer for notes.

Each handler does exactly three things: unpack the request into plain values,
call one service method, and shape the result into a response schema. Business
rules, storage, and error-to-status mapping all live elsewhere, so these
functions stay short and boring, which is the goal.
"""

from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import NoteServiceDep
from app.models import NoteCreate, NoteRead

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, service: NoteServiceDep) -> NoteRead:
    note = service.create(title=payload.title, body=payload.body)
    return NoteRead.from_domain(note)


@router.get("", response_model=list[NoteRead])
def list_notes(service: NoteServiceDep) -> list[NoteRead]:
    return [NoteRead.from_domain(note) for note in service.list()]


@router.get("/{note_id}", response_model=NoteRead)
def get_note(note_id: UUID, service: NoteServiceDep) -> NoteRead:
    return NoteRead.from_domain(service.get(note_id))


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: UUID, service: NoteServiceDep) -> None:
    service.delete(note_id)
