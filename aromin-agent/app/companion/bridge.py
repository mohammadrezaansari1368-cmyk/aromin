"""Loopback-only companion gateway. Upstream API keys never enter the browser.

Keeps the existing authenticated AROMIN API/security pipeline. No approval,
Telegram or privileged tool execution endpoints are exposed by this gateway.
"""

import asyncio
import hashlib
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.schemas import ChatRequestIn, ChatResponseOut, ConversationOut, ConversationWithMessages, TaskOut

STATIC = Path(__file__).with_name("static")


class BridgeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="COMPANION_", env_file=".env", extra="ignore")
    agent_url: str = "http://127.0.0.1:8001"
    agent_api_key: SecretStr = SecretStr("")

    @field_validator("agent_url")
    @classmethod
    def origin_only(cls, value):
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            raise ValueError("agent_url must be an HTTP(S) origin without credentials")
        if url.path not in ("", "/") or url.query or url.fragment:
            raise ValueError("agent_url must not contain a path, query or fragment")
        return value.rstrip("/")


def create_app(settings: BridgeSettings | None = None, *, client: httpx.AsyncClient | None = None):
    config = settings or BridgeSettings()
    csrf = secrets.token_urlsafe(32)
    intake_lock = asyncio.Lock()
    conversations: set[str] = set()
    tasks: dict[str, str] = {}
    requests: dict[str, tuple[str, str]] = {}

    @asynccontextmanager
    async def lifespan(app):
        owned_client = client is None
        app.state.agent_client = client or httpx.AsyncClient(
            base_url=config.agent_url, timeout=httpx.Timeout(120, connect=5), trust_env=False, follow_redirects=False
        )
        try:
            yield
        finally:
            if owned_client:
                await app.state.agent_client.aclose()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])
    app.mount("/assets", StaticFiles(directory=STATIC), name="assets")

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        return response

    def authorize(request: Request):
        expected = str(request.base_url).rstrip("/")
        if (
            (request.method not in ("GET", "HEAD") and request.headers.get("origin") != expected)
            or (request.headers.get("origin") and request.headers.get("origin") != expected)
        ) or not secrets.compare_digest(request.headers.get("x-companion-csrf", ""), csrf):
            raise HTTPException(403, "local_session_required")
        if not config.agent_api_key.get_secret_value():
            raise HTTPException(503, "agent_not_configured")

    def headers():
        return {"Authorization": "Bearer " + config.agent_api_key.get_secret_value()}

    async def upstream(request: Request, method: str, path: str, **kwargs):
        try:
            response = await request.app.state.agent_client.request(method, path, headers=headers(), **kwargs)
        except httpx.TimeoutException:
            raise HTTPException(504, "agent_outcome_unconfirmed") from None
        except httpx.HTTPError:
            raise HTTPException(502, "agent_unreachable") from None
        if not 200 <= response.status_code < 300:
            code = {
                401: "agent_auth_failed",
                403: "agent_permission_denied",
                409: "agent_task_conflict",
                429: "agent_rate_limited",
            }.get(response.status_code, "agent_request_failed")
            raise HTTPException(response.status_code if response.status_code in (401, 403, 409, 429) else 502, code)
        if len(response.content) > 2_000_000:
            raise HTTPException(502, "invalid_agent_response")
        return response

    @app.get("/")
    async def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/bridge/session")
    async def session():
        return {"csrf": csrf, "configured": bool(config.agent_api_key.get_secret_value())}

    @app.get("/bridge/status")
    async def status(request: Request):
        if not config.agent_api_key.get_secret_value():
            return {
                "configured": False,
                "reachable": False,
                "ready": False,
                "provider": "unknown",
                "profile": "unknown",
            }
        try:
            response = await request.app.state.agent_client.get("/ready", timeout=3)
            info = await request.app.state.agent_client.get("/companion/info", headers=headers(), timeout=3)
            data = info.json() if info.status_code == 200 else {}
            if not isinstance(data, dict):
                data = {}
            return {
                "configured": True,
                "reachable": response.status_code in (200, 503),
                "ready": response.status_code == 200,
                "provider": str(data.get("provider", "unknown"))[:64],
                "profile": str(data.get("profile", "unknown"))[:64],
            }
        except (httpx.HTTPError, ValueError):
            return {"configured": True, "reachable": False, "ready": False, "provider": "unknown", "profile": "unknown"}

    @app.post("/bridge/chat")
    async def chat(body: ChatRequestIn, request: Request):
        authorize(request)
        if not body.client_msg_id:
            raise HTTPException(422, "client_message_id_required")
        if body.conversation_id and body.conversation_id not in conversations:
            raise HTTPException(403, "conversation_not_owned_by_companion")
        async with intake_lock:
            digest = hashlib.sha256(body.message.encode()).hexdigest()
            previous = requests.get(body.client_msg_id)
            if previous:
                conversation_id, saved_digest = previous
                if digest != saved_digest or (body.conversation_id and body.conversation_id != conversation_id):
                    raise HTTPException(409, "client_message_id_conflict")
            else:
                if len(requests) >= 1000:
                    raise HTTPException(429, "local_session_limit")
                conversation_id = body.conversation_id
                if conversation_id is None:
                    response = await upstream(request, "POST", "/v1/conversations", json={"channel": "api"})
                    try:
                        conversation_id = ConversationOut.model_validate(response.json()).id
                    except ValueError:
                        raise HTTPException(502, "invalid_agent_response") from None
                    conversations.add(conversation_id)
                requests[body.client_msg_id] = (conversation_id, digest)
        payload = body.model_copy(update={"conversation_id": conversation_id, "channel": "api"})
        try:
            response = await upstream(request, "POST", "/v1/chat", json=payload.model_dump())
        except HTTPException as exc:
            # Preserve known conversation on uncertain timeout; retry keeps the original dedupe ID.
            return JSONResponse({"detail": exc.detail, "conversation_id": conversation_id}, status_code=exc.status_code)
        try:
            output = ChatResponseOut.model_validate(response.json())
        except ValueError:
            raise HTTPException(502, "invalid_agent_response") from None
        if output.conversation_id != conversation_id:
            raise HTTPException(502, "agent_conversation_mismatch")
        tasks[output.task_id] = conversation_id
        return JSONResponse(output.model_dump(mode="json"), status_code=response.status_code)

    @app.get("/bridge/tasks/{task_id}")
    async def task(task_id: str, request: Request):
        authorize(request)
        if task_id not in tasks:
            raise HTTPException(403, "task_not_owned_by_companion")
        response = await upstream(request, "GET", "/v1/tasks/" + task_id)
        try:
            return TaskOut.model_validate(response.json())
        except ValueError:
            raise HTTPException(502, "invalid_agent_response") from None

    @app.get("/bridge/conversations/{conversation_id}")
    async def conversation(conversation_id: str, request: Request, cursor: int = 0):
        authorize(request)
        if conversation_id not in conversations or cursor < 0:
            raise HTTPException(403, "conversation_not_owned_by_companion")
        response = await upstream(
            request, "GET", "/v1/conversations/" + conversation_id, params={"cursor": cursor, "limit": 100}
        )
        try:
            return ConversationWithMessages.model_validate(response.json())
        except ValueError:
            raise HTTPException(502, "invalid_agent_response") from None

    return app
