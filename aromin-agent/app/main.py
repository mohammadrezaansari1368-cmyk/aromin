"""FastAPI application factory.

Run: ``uvicorn app.main:app`` (see README). Tests call ``create_app(container=...)``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.middleware import RequestContextMiddleware
from app.api.routes import chat, conversations, health, tasks
from app.core.config import Settings, get_settings
from app.core.container import Container, build_container
from app.core.logging import configure_logging, get_logger


def create_app(settings: Settings | None = None, *, container: Container | None = None) -> FastAPI:
    settings = container.settings if container else (settings or get_settings())
    owns_container = container is None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if owns_container:
            configure_logging(settings.log_level, settings.log_format.value)
            app.state.container = build_container(settings)
        get_logger(__name__).info(
            "app.started", app_env=settings.app_env.value, provider=app.state.container.provider.name
        )
        try:
            yield
        finally:
            if owns_container:
                await app.state.container.aclose()

    app = FastAPI(
        title="AROMIN AI Agent API",
        version=settings.app_version,
        lifespan=lifespan,
        docs_url=None if settings.app_env.value == "production" else "/docs",
        redoc_url=None,
    )
    if container is not None:
        app.state.container = container
    if settings.cors_allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_allowed_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        )
    app.add_middleware(RequestContextMiddleware)
    register_error_handlers(app)
    for module in (health, conversations, chat, tasks):
        app.include_router(module.router)
    return app


def __getattr__(name: str) -> FastAPI:
    # ``uvicorn app.main:app`` builds the app lazily so importing this module has no side effects.
    if name == "app":
        return create_app()
    raise AttributeError(name)
