"""Context Engine (blueprint §5) — Phase 1 slots: system prompt and recent turns.

Budgets are in tokens. Without the target model's tokenizer we use a conservative
estimator (Persian text costs more tokens per character than English). Oldest turns
are dropped first; the newest user message is always kept. KB, memory, tool-result and
web slots are later phases.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.providers.base import ChatMessage, ChatRequest


def estimate_tokens(text: str) -> int:
    """~3 characters per token, rounded up, plus a small per-message overhead."""
    return (len(text) + 2) // 3 + 4


@dataclass(frozen=True)
class ContextBudget:
    system_tokens: int = 700
    history_tokens: int = 2000


@dataclass(frozen=True)
class ContextTurn:
    role: str
    content: str


class ContextEngine:
    def __init__(self, budget: ContextBudget | None = None) -> None:
        self.budget = budget or ContextBudget()

    def build(
        self,
        *,
        system_prompt: str,
        history: Sequence[ContextTurn],
        model: str,
        max_output_tokens: int,
        timeout_s: float,
    ) -> ChatRequest:
        if estimate_tokens(system_prompt) > self.budget.system_tokens:
            raise ValueError("system prompt exceeds its token budget")
        kept: list[ContextTurn] = []
        used = 0
        for turn in reversed(history):
            if turn.role not in ("user", "assistant"):
                continue
            cost = estimate_tokens(turn.content)
            if kept and used + cost > self.budget.history_tokens:
                break
            kept.append(turn)
            used += cost
        kept.reverse()
        messages = [ChatMessage(role="system", content=system_prompt)]
        messages += [ChatMessage(role=t.role, content=t.content) for t in kept]  # type: ignore[arg-type]
        return ChatRequest(model=model, messages=messages, max_output_tokens=max_output_tokens, timeout_s=timeout_s)
