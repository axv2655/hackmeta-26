"""Serve the built desktop web client on the mobile backend's existing origin."""

from pathlib import Path

from fastapi import FastAPI
from starlette.responses import RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class WebFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        # Revalidate HTML so a deployment never strands users on old asset hashes.
        # Images can change without a new filename, so only Vite assets are immutable.
        if response.status_code in (200, 304):
            normalized = path.replace("\\", "/")
            response.headers["Cache-Control"] = (
                "public, max-age=31536000, immutable"
                if normalized.startswith("assets/")
                else "no-cache"
            )
        return response


def mount_web(app: FastAPI, directory: str | Path) -> None:
    """Mount last so API, socket, media, docs, invites and MCP retain precedence.

    Backend-only development still works when the optional Vite build is absent.
    No SPA fallback: unknown API routes and missing assets must remain 404s.
    """
    directory = Path(directory)
    if not (directory / "index.html").is_file():
        return

    @app.get("/web", include_in_schema=False)
    @app.get("/web/", include_in_schema=False)
    def web_entry() -> RedirectResponse:
        return RedirectResponse("/", status_code=307)

    app.mount("/", WebFiles(directory=directory, html=True), name="web")
