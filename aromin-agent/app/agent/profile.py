"""AgentProfile (blueprint §3). Phase 1 ships one generic profile with no tools.
Profiles become versioned DB config with the policy layer in Phase 2.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.providers.factory import ModelTier

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


GENERIC_PROFILE = AgentProfile(name="generic", system_prompt=GENERIC_SYSTEM_PROMPT)
