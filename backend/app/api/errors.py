"""Translate domain errors into HTTP responses, once, for the whole app.

Services raise plain Python exceptions from `app/domain`. Registering handlers
here means no route handler has to remember the mapping, and the mapping is
easy to audit in one file.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.domain.notes import InvalidNote, NoteNotFound


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(NoteNotFound)
    async def _not_found(_: Request, exc: NoteNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidNote)
    async def _invalid(_: Request, exc: InvalidNote) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})
