from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.main import api_router
from app.container import Container
from app.core.config import settings
from app.hooks import Hooks
from app.lanes import Registrar, core, muse, surfaces
from app.scheduler.loop import Scheduler

LANES: tuple[Registrar, ...] = (core.register, muse.register, surfaces.register)


def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else "default"
    return f"{tag}-{route.name}"


def create_app(lanes: Sequence[Registrar] = LANES) -> FastAPI:
    """Build the app. `lanes=()` boots with every port null (contract tests)."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        container, hooks, scheduler = Container(), Hooks(), Scheduler()
        for register in lanes:
            register(container, hooks, scheduler)
        app.state.container = container
        app.state.hooks = hooks
        app.state.scheduler = scheduler
        scheduler.start()
        try:
            yield
        finally:
            await scheduler.stop()

    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        generate_unique_id_function=custom_generate_unique_id,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_HOST],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.API_V1_STR)
    register_exception_handlers(app)
    return app


if settings.SENTRY_DSN and settings.FASTAPI_ENV != "development":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = create_app()
