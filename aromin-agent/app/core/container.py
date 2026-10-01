"""Composition root: builds every collaborator once per process from Settings.

Tests build their own container (e.g. with a scripted MockProvider) and pass it to
``create_app``; nothing reads global state.
"""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from app.agent.profile import GENERIC_PROFILE, AgentProfile
from app.agent.runtime import AgentLimits, AgentRuntime
from app.agent.usage import CostEstimator
from app.context.engine import ContextEngine
from app.core.config import Settings
from app.db.session import create_engine, create_session_factory
from app.db.uow import UowFactory, make_uow_factory
from app.events.recorder import EventRecorder
from app.memory.conversation import ConversationMemory
from app.policy.engine import PolicyConfig, PolicyEngine
from app.providers.base import LLMProvider
from app.providers.factory import ModelRouter, build_provider
from app.security.auth import ApiKeyAuthenticator, Authenticator
from app.security.rate_limit import InMemoryRateLimiter, RateLimiter
from app.services.approvals import ApprovalService
from app.services.audit import AuditLogger
from app.services.conversations import ConversationService
from app.tasks.engine import TaskEngine
from app.tools.builtin import register_builtin_tools
from app.tools.executor import ToolExecutor
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
    approvals: ApprovalService
    registry: ToolRegistry
    executor: ToolExecutor
    policy: PolicyEngine
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
    registry: ToolRegistry | None = None,
) -> Container:
    engine = create_engine(settings)
    uow_factory = make_uow_factory(create_session_factory(engine))
    provider = provider or build_provider(settings)
    memory = ConversationMemory()
    events = EventRecorder()
    tasks = TaskEngine(
        lease_seconds=int(max(settings.llm_timeout_seconds, settings.agent_turn_timeout_seconds))
        + settings.task_lease_seconds
    )
    audit = AuditLogger()
    if registry is None:
        registry = ToolRegistry()
        register_builtin_tools(registry)
    policy = PolicyEngine(PolicyConfig.from_settings(settings))
    executor = ToolExecutor(
        uow_factory=uow_factory, registry=registry, policy=policy, audit=audit, events=events,
        approval_ttl_seconds=settings.approval_ttl_seconds,
    )  # fmt: skip
    approvals = ApprovalService(uow_factory, tasks, audit, events)
    runtime = AgentRuntime(
        uow_factory=uow_factory,
        provider=provider,
        model_router=ModelRouter(settings.model_tiers),
        memory=memory,
        context=ContextEngine(),
        tools=registry,
        tasks=tasks,
        events=events,
        profile=profile,
        provider_timeout_s=settings.llm_timeout_seconds,
        executor=executor,
        limits=AgentLimits(
            max_tool_iterations=settings.agent_max_tool_iterations,
            turn_timeout_s=settings.agent_turn_timeout_seconds,
            max_tokens_per_turn=settings.agent_max_tokens_per_turn,
            max_cost_per_turn=settings.agent_max_cost_per_turn,
        ),
        cost=CostEstimator(settings.llm_pricing),
        approvals=approvals,
    )
    redis = Redis.from_url(settings.redis_url.get_secret_value()) if settings.redis_url else None
    return Container(
        settings=settings,
        engine=engine,
        uow_factory=uow_factory,
        provider=provider,
        runtime=runtime,
        conversations=ConversationService(uow_factory, memory, events, audit, profile.name),
        tasks=tasks,
        approvals=approvals,
        registry=registry,
        executor=executor,
        policy=policy,
        authenticator=ApiKeyAuthenticator(uow_factory),
        rate_limiter=rate_limiter or InMemoryRateLimiter(),
        redis=redis,
    )
