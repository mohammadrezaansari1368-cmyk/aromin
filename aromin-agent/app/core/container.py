"""Composition root: builds every collaborator once per process from Settings.

Tests build their own container (e.g. with a scripted MockProvider) and pass it to
``create_app``; nothing reads global state.
"""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from app.agent.profile import GENERIC_PROFILE, AgentProfile
from app.agent.runtime import AgentRuntime
from app.context.engine import ContextEngine
from app.core.config import Settings
from app.db.session import create_engine, create_session_factory
from app.db.uow import UowFactory, make_uow_factory
from app.events.recorder import EventRecorder
from app.memory.conversation import ConversationMemory
from app.providers.base import LLMProvider
from app.providers.factory import ModelRouter, build_provider
from app.security.auth import ApiKeyAuthenticator, Authenticator
from app.security.rate_limit import InMemoryRateLimiter, RateLimiter
from app.services.audit import AuditLogger
from app.services.conversations import ConversationService
from app.tasks.engine import TaskEngine
from app.tools.registry import ToolRegistry


@dataclass
class Container:
    settings: Settings
    engine: AsyncEngine
    uow_factory: UowFactory
    provider: LLMProvider
    runtime: AgentRuntime
    conversations: ConversationService
    tasks: TaskEngine
    authenticator: Authenticator
    rate_limiter: RateLimiter
    redis: Redis | None

    async def aclose(self) -> None:
        await self.provider.aclose()
        if self.redis is not None:
            await self.redis.aclose()
        await self.engine.dispose()


def build_container(
    settings: Settings,
    *,
    provider: LLMProvider | None = None,
    profile: AgentProfile = GENERIC_PROFILE,
    rate_limiter: RateLimiter | None = None,
) -> Container:
    engine = create_engine(settings)
    uow_factory = make_uow_factory(create_session_factory(engine))
    provider = provider or build_provider(settings)
    memory = ConversationMemory()
    events = EventRecorder()
    tasks = TaskEngine(lease_seconds=int(settings.llm_timeout_seconds) + settings.task_lease_seconds)
    runtime = AgentRuntime(
        uow_factory=uow_factory,
        provider=provider,
        model_router=ModelRouter(settings.model_tiers),
        memory=memory,
        context=ContextEngine(),
        tools=ToolRegistry(),
        tasks=tasks,
        events=events,
        profile=profile,
        provider_timeout_s=settings.llm_timeout_seconds,
    )
    redis = Redis.from_url(settings.redis_url.get_secret_value()) if settings.redis_url else None
    return Container(
        settings=settings,
        engine=engine,
        uow_factory=uow_factory,
        provider=provider,
        runtime=runtime,
        conversations=ConversationService(uow_factory, memory, events, AuditLogger(), profile.name),
        tasks=tasks,
        authenticator=ApiKeyAuthenticator(uow_factory),
        rate_limiter=rate_limiter or InMemoryRateLimiter(),
        redis=redis,
    )
