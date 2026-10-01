"""FastAPI dependencies: container access, authentication, permissions, rate limits."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated

import structlog
from fastapi import Depends, Header, Request

from app.core.container import Container
from app.core.errors import Forbidden, RateLimited
from app.security.auth import Principal


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]


async def get_principal(container: ContainerDep, authorization: Annotated[str | None, Header()] = None) -> Principal:
    principal = await container.authenticator.authenticate(authorization)
    structlog.contextvars.bind_contextvars(principal_id=principal.id)
    return principal


def require(permission: str) -> Callable[..., Awaitable[Principal]]:
    async def _check(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        if not principal.has(permission):
            raise Forbidden(f"Missing permission '{permission}'")
        return principal

    return _check


def rate_limit(bucket: str) -> Callable[..., Awaitable[None]]:
    async def _limit(container: ContainerDep, principal: Annotated[Principal, Depends(get_principal)]) -> None:
        decision = await container.rate_limiter.hit(
            f"{bucket}:{principal.id}", capacity=container.settings.rate_limit_chat_per_minute, per_seconds=60.0
        )
        if not decision.allowed:
            raise RateLimited(extra={"retry_after": decision.retry_after_s})

    return _limit
