"""Two levels of test, one per layer boundary.

* `TestNoteService` exercises the use cases directly with the in-memory
  adapter and a fixed clock. No HTTP, no FastAPI, sub-millisecond.
* `TestNotesApi` goes through the real router with a fresh repository injected
  via `dependency_overrides`, checking the HTTP contract and error mapping.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_note_repository
from app.domain.notes import InvalidNote, NoteNotFound
from app.main import app
from app.repositories.notes import InMemoryNoteRepository
from app.services.notes import NoteService

FIXED_NOW = datetime(2026, 1, 1, tzinfo=UTC)


class TestNoteService:
    def make_service(self) -> NoteService:
        return NoteService(InMemoryNoteRepository(), clock=lambda: FIXED_NOW)

    def test_create_normalizes_title_and_stamps_time(self) -> None:
        service = self.make_service()
        note = service.create(title="  Hello  ", body="world")
        assert note.title == "Hello"
        assert note.created_at == FIXED_NOW
        assert service.get(note.id) == note

    def test_blank_title_is_rejected_before_storage(self) -> None:
        service = self.make_service()
        with pytest.raises(InvalidNote):
            service.create(title="   ", body="")
        assert service.list() == []

    def test_missing_note_raises_domain_error(self) -> None:
        service = self.make_service()
        with pytest.raises(NoteNotFound):
            service.get(uuid4())
        with pytest.raises(NoteNotFound):
            service.delete(uuid4())


class TestNotesApi:
    @pytest.fixture
    def client(self):
        # One repository per *test*, shared across that test's requests. FastAPI
        # calls the override on every request, so passing the class itself would
        # hand each request an empty store.
        repository = InMemoryNoteRepository()
        app.dependency_overrides[get_note_repository] = lambda: repository
        with TestClient(app) as client:
            yield client
        app.dependency_overrides.clear()

    def test_create_list_get_delete_round_trip(self, client: TestClient) -> None:
        created = client.post(
            "/api/v1/notes", json={"title": "Pitch", "body": "90 seconds"}
        )
        assert created.status_code == 201
        note = created.json()
        assert note["title"] == "Pitch"

        assert [n["id"] for n in client.get("/api/v1/notes").json()] == [note["id"]]
        assert client.get(f"/api/v1/notes/{note['id']}").json() == note
        assert client.delete(f"/api/v1/notes/{note['id']}").status_code == 204
        assert client.get("/api/v1/notes").json() == []

    def test_domain_errors_map_to_http_statuses(self, client: TestClient) -> None:
        assert client.get(f"/api/v1/notes/{uuid4()}").status_code == 404
        blank = client.post("/api/v1/notes", json={"title": "   ", "body": ""})
        assert blank.status_code == 422
        assert blank.json()["detail"] == "title must not be blank"
