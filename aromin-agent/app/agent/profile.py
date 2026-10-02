"""AgentProfile (blueprint §3). One generic profile, offered the Phase 2 built-in tools.
Which tools a profile may *request* is listed here; whether a call may *run* is decided
server-side by the executor and the policy engine.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.providers.factory import ModelTier
from app.tools.builtin import BUILTIN_TOOL_NAMES

GENERIC_SYSTEM_PROMPT = (
    "تو دستیار هوش مصنوعی آرومین هستی. کوتاه، دقیق و مؤدبانه به فارسی پاسخ بده. "
    "اگر اطلاعاتی را نمی‌دانی، حدس نزن و بگو که نمی‌دانی. "
    "درباره قیمت، تخفیف یا قرارداد هیچ تعهدی نده."
)


class AgentProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    version: int = 1
    system_prompt: str
    model_tier: ModelTier = "main"
    allowed_tools: frozenset[str] = frozenset()
    max_steps: int = 6
    max_turn_seconds: float = 25.0
    max_output_tokens: int = 1024


GENERIC_PROFILE = AgentProfile(name="generic", system_prompt=GENERIC_SYSTEM_PROMPT, allowed_tools=BUILTIN_TOOL_NAMES)
