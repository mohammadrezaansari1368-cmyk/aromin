"""Token / cost accounting for every model invocation (blueprint §17 ``llm_usage``)."""

from __future__ import annotations

from app.core.ids import new_id
from app.db.uow import UnitOfWork
from app.models.base import utcnow
from app.models.tooling import LLMUsage
from app.providers.base import Usage


class CostEstimator:
    """Prices come from configuration (``LLM_PRICING``, per 1M tokens). Unknown model -> None."""

    def __init__(self, pricing: dict[str, dict[str, float]]) -> None:
        self._pricing = pricing

    def estimate(self, model: str, usage: Usage) -> float | None:
        price = self._pricing.get(model)
        if not price:
            return None
        cost = usage.input_tokens * price.get("input_per_1m", 0.0) + usage.output_tokens * price.get(
            "output_per_1m", 0.0
        )
        return round(cost / 1_000_000, 6)


def record_usage(
    uow: UnitOfWork,
    *,
    task_id: str,
    conversation_id: str | None,
    step_no: int | None,
    provider: str,
    model: str,
    tier: str | None,
    usage: Usage | None,
    latency_ms: int,
    status: str,
    error_type: str | None,
    cost: float | None,
) -> LLMUsage:
    u = usage or Usage()
    row = LLMUsage(
        id=new_id("llm"), task_id=task_id, conversation_id=conversation_id, step_no=step_no, provider=provider,
        model=model, tier=tier, status=status, error_type=error_type, input_tokens=u.input_tokens,
        output_tokens=u.output_tokens, total_tokens=u.input_tokens + u.output_tokens, estimated_cost=cost,
        latency_ms=latency_ms, created_at=utcnow(),
    )  # fmt: skip
    uow.usage.add(row)
    return row
