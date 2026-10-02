from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.deps import ContainerDep
from app.api.schemas import HealthOut, ReadyOut
from app.core.logging import get_logger
from app.db.health import database_ping

router = APIRouter(tags=["health"])
log = get_logger(__name__)


@router.get("/health", response_model=HealthOut)
async def health(container: ContainerDep) -> HealthOut:
    """Liveness: the process is up. No dependencies are checked."""
    return HealthOut(status="ok", version=container.settings.app_version)


@router.get("/ready", response_model=ReadyOut, responses={503: {"model": ReadyOut}})
async def ready(container: ContainerDep) -> JSONResponse:
    """Readiness: database reachable, and Redis reachable when configured."""
    checks: dict[str, str] = {}
    try:
        await database_ping(container.engine)
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - any failure means not ready
        checks["database"] = "error"
        log.warning("ready.check_failed", check="database", error_type=type(exc).__name__)
    if container.redis is None:
        checks["redis"] = "not_configured"
    else:
        try:
            await container.redis.ping()
            checks["redis"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["redis"] = "error"
            log.warning("ready.check_failed", check="redis", error_type=type(exc).__name__)
    ok = all(v in ("ok", "not_configured") for v in checks.values())
    body = ReadyOut(status="ready" if ok else "not_ready", checks=checks)
    return JSONResponse(body.model_dump(), status_code=200 if ok else 503)
