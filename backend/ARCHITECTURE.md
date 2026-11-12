# Backend architecture walkthrough

This template keeps the layout of the
[official FastAPI full-stack template](https://github.com/fastapi/full-stack-fastapi-template/tree/master/backend)
and adds one fully worked feature, **notes**, that shows how to layer a FastAPI
app so business rules do not leak into HTTP handlers or storage code. Read the
files in the order below; each one's module docstring explains its job.

## The one rule

**Dependencies point inward.** Outer layers import inner layers, never the
reverse.

```text
            ┌──────────────────────────────────────────────┐
  outer     │ api/        HTTP: routes, schemas, deps      │  knows FastAPI
            │ ┌──────────────────────────────────────────┐ │
            │ │ services/   use cases                    │ │  knows domain + ports
            │ │ ┌──────────────────────────────────────┐ │ │
  inner     │ │ │ domain/   entities, rules, errors    │ │ │  knows nothing
            │ │ └──────────────────────────────────────┘ │ │
            │ └──────────────────────────────────────────┘ │
            │ repositories/  ports (Protocols) + adapters  │  adapters know storage
            └──────────────────────────────────────────────┘
```

`domain/` imports only the standard library. `services/` imports `domain/` and
the repository *Protocol*. `api/` imports everything and is the only layer that
knows which concrete adapter is in use.

## Follow one request

`POST /api/v1/notes` with `{"title": "  Pitch ", "body": "90s"}`:

| Step | File | What happens |
| --- | --- | --- |
| 1 | `backend/app/api/routes/notes.py` | FastAPI validates the body into a `NoteCreate` schema and resolves `NoteServiceDep`. |
| 2 | `backend/app/api/deps.py` | Builds a `NoteService` around the cached `InMemoryNoteRepository`. This is the *composition root*: the one place that picks adapters. |
| 3 | `backend/app/services/notes.py` | `NoteService.create` asks the domain to validate the title, stamps the time via an injected clock, and hands the entity to the repository. |
| 4 | `backend/app/domain/notes.py` | `validate_title` strips whitespace and enforces length. Raises `InvalidNote` on failure. |
| 5 | `backend/app/repositories/notes.py` | The adapter stores the `Note` in a dict. |
| 6 | `backend/app/models.py` | `NoteRead.from_domain` turns the entity into the response schema. |
| err | `backend/app/api/errors.py` | If step 4 raised, the handler registered in `main.py` turns `InvalidNote` into a 422 and `NoteNotFound` into a 404. |

The route handler itself is four lines. That is the payoff.

## Why each split exists

**Schemas (`models.py`) vs entities (`domain/`).** Schemas describe JSON on
the wire and change for client reasons. Entities describe the business and
change for business reasons. Merging them couples the two.

**Service vs route.** The service has no idea it is being called over HTTP.
`tests/test_notes.py::TestNoteService` proves it: the use cases are tested with
a plain function call, a fake clock, and no web server.

**Port vs adapter.** `NoteRepository` is a `typing.Protocol`, so any object
with the right methods satisfies it. Swapping in-memory for Postgres is a new
class plus one changed line in `deps.py`.

**Exception handlers vs `HTTPException` in routes.** Domain code raises domain
errors. One file maps them to status codes, so the mapping cannot drift between
routes.

## Adding a feature

1. `domain/<thing>.py`: entity, invariants, error types. No imports from `app`.
2. `repositories/<thing>.py`: a `Protocol` with only the methods the use cases
   need, plus an in-memory adapter.
3. `services/<thing>.py`: one method per use case; constructor takes the port.
4. `models.py`: request and response schemas with a `from_domain`.
5. `api/routes/<thing>.py`: thin handlers; register the router in
   `api/main.py`.
6. `api/deps.py`: provide the service. `api/errors.py`: map new domain errors.
7. `tests/test_<thing>.py`: service tests first, then one HTTP round trip.

## Adding a database

Follow the numbered steps in `backend/app/core/db.py`. The short version: write
`SqlNoteRepository` in `repositories/notes.py`, give it a session, and change
the adapter chosen in `deps.py`. Services, routes, schemas, and tests of the
service layer are untouched.

## When this is too much

For a 36-hour hackathon with one or two endpoints, a route that calls a dict is
fine. Layer when a second storage backend, a second interface (CLI, worker,
WebSocket), or a non-trivial rule shows up. The value of the structure is that
adding those later does not require rewriting what exists.
