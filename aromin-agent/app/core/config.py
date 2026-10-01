"""Central configuration, loaded from environment variables (12-factor, blueprint §18).

Secrets are typed as ``SecretStr`` so they never appear in ``repr()``, logs or error
responses. Nothing here has a real default credential.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppEnv(StrEnum):
    development = "development"
    test = "test"
    staging = "staging"
    production = "production"


class LLMProviderName(StrEnum):
    mock = "mock"
    openai_compatible = "openai_compatible"
    arvan = "arvan"


class LogFormat(StrEnum):
    json = "json"
    console = "console"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # application
    app_env: AppEnv = AppEnv.development
    app_name: str = "aromin-agent"
    app_version: str = "0.1.0"

    # database / redis
    database_url: SecretStr = SecretStr("sqlite+aiosqlite:///./aromin_agent.db")
    database_echo: bool = False
    database_pool_size: int = Field(default=10, ge=1, le=100)
    redis_url: SecretStr | None = None

    # LLM provider (blueprint §15: provider-independent, Arvan first after verification)
    llm_provider: LLMProviderName = LLMProviderName.mock
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    llm_model_small: str = "mock-small"
    llm_model_main: str = "mock-main"
    llm_model_large: str = "mock-large"
    llm_timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    llm_max_output_tokens: int = Field(default=1024, ge=1, le=32000)
    arvan_api_verified: bool = False
    allow_mock_provider_in_production: bool = False

    # API authentication / security
    api_key_prefix: str = "ak"
    rate_limit_chat_per_minute: int = Field(default=30, ge=1)
    cors_allowed_origins: list[str] = Field(default_factory=list)

    # logging
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.json

    # task workers (Task Engine arrives in a later phase; values reserved here)
    worker_concurrency: int = Field(default=16, ge=1)
    task_lease_seconds: int = Field(default=60, ge=10)

    # web search / SMS (later phases; placeholders only, never used in Phase 1)
    web_search_provider: str | None = None
    web_search_api_key: SecretStr | None = None
    sms_provider: str | None = None
    sms_api_key: SecretStr | None = None
    sms_sending_enabled: bool = False

    @field_validator("log_level")
    @classmethod
    def _valid_level(cls, v: str) -> str:
        v = v.upper()
        if v not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("invalid log level")
        return v

    @model_validator(mode="after")
    def _guard_production(self) -> Settings:
        if self.app_env == AppEnv.production:
            if self.llm_provider == LLMProviderName.mock and not self.allow_mock_provider_in_production:
                raise ValueError("LLM_PROVIDER=mock is not allowed in production")
            if self.database_url.get_secret_value().startswith("sqlite"):
                raise ValueError("SQLite is not allowed in production; use PostgreSQL")
        if self.sms_sending_enabled:
            raise ValueError("SMS sending is not implemented in this phase; SMS_SENDING_ENABLED must be false")
        return self

    @property
    def model_tiers(self) -> dict[str, str]:
        return {"small": self.llm_model_small, "main": self.llm_model_main, "large": self.llm_model_large}


@lru_cache
def get_settings() -> Settings:
    return Settings()
