"""Build the configured provider and select models by tier (blueprint §15 model routing)."""

from __future__ import annotations

from typing import Literal

from app.core.config import LLMProviderName, Settings
from app.providers.arvan import ArvanProvider
from app.providers.base import LLMProvider
from app.providers.errors import ProviderConfigurationError
from app.providers.mock import MockProvider
from app.providers.openai_compat import OpenAICompatibleProvider

ModelTier = Literal["small", "main", "large"]


def build_provider(settings: Settings) -> LLMProvider:
    key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
    match settings.llm_provider:
        case LLMProviderName.mock:
            return MockProvider()
        case LLMProviderName.openai_compatible:
            if not settings.llm_base_url or not key:
                raise ProviderConfigurationError(
                    "LLM_BASE_URL and LLM_API_KEY are required", provider="openai_compatible"
                )
            return OpenAICompatibleProvider(base_url=settings.llm_base_url, api_key=key)
        case LLMProviderName.arvan:
            return ArvanProvider(base_url=settings.llm_base_url, api_key=key, verified=settings.arvan_api_verified)
    raise ProviderConfigurationError(f"unknown provider {settings.llm_provider}")  # pragma: no cover


class ModelRouter:
    """Maps a profile's tier to a concrete model name from configuration."""

    def __init__(self, tiers: dict[str, str]) -> None:
        self._tiers = dict(tiers)

    def select(self, tier: ModelTier) -> str:
        try:
            return self._tiers[tier]
        except KeyError as exc:
            raise ProviderConfigurationError(f"no model configured for tier '{tier}'") from exc
