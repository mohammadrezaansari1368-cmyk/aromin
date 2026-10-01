"""Arvan Cloud AI adapter — connectable, but NOT verified.

Blueprint §15 requires verifying Arvan's real API before building on it: endpoint format,
models, streaming, JSON mode, tool calling, usage fields, rate limits and data terms.
None of that has been verified yet, so this adapter refuses to start unless the operator
sets ``ARVAN_API_VERIFIED=true`` after completing that checklist.

If verification confirms an OpenAI-compatible chat completions endpoint, this class works
as-is through the generic adapter. If it does not, only this file changes.
"""

from __future__ import annotations

from app.providers.errors import ProviderConfigurationError
from app.providers.openai_compat import OpenAICompatibleProvider

VERIFICATION_CHECKLIST = (
    "endpoint format",
    "available chat models and Persian quality",
    "streaming",
    "JSON / structured output",
    "tool calling",
    "usage metadata",
    "rate limits and pricing",
    "data retention terms",
)


class ArvanProvider(OpenAICompatibleProvider):
    name = "arvan"

    def __init__(self, *, base_url: str | None, api_key: str | None, verified: bool, **kwargs) -> None:
        if not verified:
            raise ProviderConfigurationError(
                "Arvan adapter is not verified; complete the blueprint §15 checklist and set ARVAN_API_VERIFIED=true",
                provider=self.name,
            )
        if not base_url or not api_key:
            raise ProviderConfigurationError("LLM_BASE_URL and LLM_API_KEY are required", provider=self.name)
        super().__init__(base_url=base_url, api_key=api_key, **kwargs)
