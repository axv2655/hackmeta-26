"""Translate domain errors into HTTP responses, once, for the whole app.

Services raise plain Python exceptions from `app/domain`. Registering handlers
here means no route handler has to remember the mapping, and the mapping is
easy to audit in one file.

Every core error derives from one kind in `app.domain.errors`, and the kind
alone picks the status (`DOMAIN_STATUS`). Errors are `{"detail": str(exc)}`
(ARCHITECTURE.md 14).
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.domain.errors import Conflict, DomainError, Forbidden, Invalid, NotFound
from app.domain.notes import InvalidNote, NoteNotFound
from app.ports import PortUnavailable

DOMAIN_STATUS: tuple[tuple[type[DomainError], int], ...] = (
    (NotFound, status.HTTP_404_NOT_FOUND),
    (Forbidden, status.HTTP_403_FORBIDDEN),
    (Conflict, status.HTTP_409_CONFLICT),
    (Invalid, status.HTTP_422_UNPROCESSABLE_CONTENT),
)


def domain_status(exc: DomainError) -> int:
    """The status for `exc`'s kind; 400 for a bare `DomainError`."""
    return next(
        (code for kind, code in DOMAIN_STATUS if isinstance(exc, kind)),
        status.HTTP_400_BAD_REQUEST,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=domain_status(exc), content={"detail": str(exc)}
        )

    @app.exception_handler(NoteNotFound)
    async def _not_found(_: Request, exc: NoteNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidNote)
    async def _invalid(_: Request, exc: InvalidNote) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(PortUnavailable)
    async def _port_unavailable(_: Request, exc: PortUnavailable) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})
