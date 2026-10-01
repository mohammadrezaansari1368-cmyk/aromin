import pytest
from pydantic import ValidationError

from app.core.config import AppEnv, LLMProviderName, Settings


def make(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_defaults_are_safe_for_development():
    s = make()
    assert s.app_env == AppEnv.development
    assert s.llm_provider == LLMProviderName.mock
    assert s.llm_api_key is None
    assert s.sms_sending_enabled is False
    assert s.model_tiers == {"small": "mock-small", "main": "mock-main", "large": "mock-large"}


def test_reads_environment_variables(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "12.5")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("LLM_MODEL_MAIN", "main-model")
    s = make()
    assert s.app_env == AppEnv.staging
    assert s.llm_timeout_seconds == 12.5
    assert s.log_level == "DEBUG"
    assert s.model_tiers["main"] == "main-model"


def test_secrets_are_hidden_in_repr_and_dump():
    s = make(llm_api_key="sk-very-secret", database_url="postgresql+asyncpg://u:p4ss@db/x")
    text = repr(s) + str(s.model_dump())
    assert "sk-very-secret" not in text
    assert "p4ss" not in text
    assert s.llm_api_key.get_secret_value() == "sk-very-secret"


def test_production_refuses_mock_provider_and_sqlite():
    with pytest.raises(ValidationError, match="mock is not allowed"):
        make(app_env="production", database_url="postgresql+asyncpg://u:p@db/x")
    with pytest.raises(ValidationError, match="SQLite is not allowed"):
        make(app_env="production", llm_provider="openai_compatible")


def test_sms_sending_cannot_be_enabled_in_this_phase():
    with pytest.raises(ValidationError, match="SMS sending is not implemented"):
        make(sms_sending_enabled=True)


@pytest.mark.parametrize(
    "field,value", [("llm_timeout_seconds", 0), ("log_level", "LOUD"), ("llm_provider", "unknown")]
)
def test_invalid_values_rejected(field, value):
    with pytest.raises(ValidationError):
        make(**{field: value})


def test_env_example_lists_every_setting():
    from pathlib import Path

    example = (Path(__file__).resolve().parents[1] / ".env.example").read_text()
    for name in Settings.model_fields:
        assert f"{name.upper()}=" in example, f"{name.upper()} missing from .env.example"
