"""
Tests for application configuration helpers.
"""

import os
from unittest.mock import patch

from app.core.config import Settings


def test_sqlalchemy_database_uri_builds_expected_url() -> None:
  """Ensure the computed SQLAlchemy URI matches expected formatting."""
  old_val = os.environ.get("USE_SQLITE_ALEMBIC")
  if old_val is not None:
    del os.environ["USE_SQLITE_ALEMBIC"]

  settings = Settings(
    POSTGRES_SERVER="db.local",
    POSTGRES_USER="alice",
    POSTGRES_PASSWORD="secret",
    POSTGRES_DB="analytics",
    POSTGRES_PORT=5433,
    OLLAMA_MODELS="",
    LLM_LOCAL_MODELS="",
  )

  assert settings.SQLALCHEMY_DATABASE_URI == "postgresql+asyncpg://alice:secret@db.local:5433/analytics"

  if old_val is not None:
    os.environ["USE_SQLITE_ALEMBIC"] = old_val


def test_config_sqlite_alembic_branch() -> None:
  """Tests SQLALCHEMY_DATABASE_URI when USE_SQLITE_ALEMBIC is enabled."""
  with patch.dict(os.environ, {"USE_SQLITE_ALEMBIC": "1"}):
    s = Settings()
    uri = s.SQLALCHEMY_DATABASE_URI
    assert "sqlite" in uri


def test_llm_swarm_defaults_to_empty() -> None:
  """Ensure default behavior is an empty list if no env vars are set."""
  settings = Settings(
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    GEMINI_API_KEY=None,
    GOOGLE_API_KEY=None,
    LLM_LOCAL_MODELS="",
    OLLAMA_MODELS="",
  )

  swarm = settings.LLM_SWARM
  assert len(swarm) == 0


def test_llm_swarm_exhaustive_parsing() -> None:
  """
  Provides exhaustive coverage to hit all branches of internal `_resolve_model_display_name`
  and `_parse_model_entries` within the Settings class.
  """
  settings = Settings(
    LLM_LOCAL_MODELS="just-model-id,  ,",
    OPENAI_API_KEY="x",
    OPENAI_MODELS="",
    GEMINI_API_KEY="x",
    GEMINI_MODELS="gemini-1.5-pro",
    OLLAMA_MODELS=(
      "deepseek-r1,deepseek-coder:base,qwen2.5-coder,gpt-4o,mistral-large,claude-3-opus,local-model,custom-id|Local DS"
    ),
    MISTRAL_API_KEY="x",
    MISTRAL_MODELS="mistral-large",
    ANTHROPIC_API_KEY="x",
    ANTHROPIC_MODELS="claude-3-opus",
  )

  swarm = settings.LLM_SWARM
  names = {item["name"] for item in swarm}

  assert "Local DS" in names
  assert "Local LLM: DeepSeek R1" in names
  assert "Local LLM: DeepSeek Coder" in names
  assert "Local LLM: Qwen 2.5 Coder" in names
  assert "Local LLM: GPT-4o" in names
  assert "Local LLM: Mistral Large" in names
  assert "Local LLM: Claude 3 Opus" in names
  assert "Local Model" in names
  assert "just-model-id" in [m["model_name"] for m in swarm]
  assert "GPT-4o" in names
  assert "Gemini 1.5 Pro" in names


def test_llm_swarm_mixed_provider_mapping() -> None:
  """Verify robust mapping across different providers."""
  settings = Settings(
    LLM_LOCAL_MODELS="gemma:2b|Model 0",
    GEMINI_API_KEY="fake-key",
    GEMINI_MODELS="gemini-1.5-pro|Model 1",
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    OLLAMA_MODELS="",
  )

  swarm = settings.LLM_SWARM

  m0 = next((s for s in swarm if s["name"] == "Model 0"), None)
  assert m0 is not None
  assert m0["provider"] == "openai"
  assert m0["model_name"] == "gemma:2b"

  m1 = next((s for s in swarm if s["name"] == "Model 1"), None)
  assert m1 is not None
  assert m1["provider"] == "gemini"
  assert m1["model_name"] == "gemini-1.5-pro"


def test_llm_swarm_auto_ollama_fallback() -> None:
  """Verify that OLLAMA_MODELS field is picked up independently."""
  settings = Settings(
    OLLAMA_MODELS="qwen2:0.5b|Qwen Tiny",
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    GEMINI_API_KEY=None,
    GOOGLE_API_KEY=None,
    LLM_LOCAL_MODELS="",
  )

  swarm = settings.LLM_SWARM
  assert len(swarm) == 1
  assert swarm[0]["model_name"] == "qwen2:0.5b"
  assert "Qwen Tiny" in swarm[0]["name"]


def test_cors_origins_parsing() -> None:
  """Test parsing of CORS origins from both list and comma-separated string formats."""
  settings_list = Settings(
    BACKEND_CORS_ORIGINS=["http://localhost:4200", "https://dashboard.hospital.org"],
    OLLAMA_MODELS="",
    LLM_LOCAL_MODELS="",
  )
  assert settings_list.parsed_cors_origins == ["http://localhost:4200", "https://dashboard.hospital.org"]

  settings_str = Settings(
    BACKEND_CORS_ORIGINS="http://localhost:3000, https://hospital.org , , http://localhost:4200",
    OLLAMA_MODELS="",
    LLM_LOCAL_MODELS="",
  )
  assert settings_str.parsed_cors_origins == [
    "http://localhost:3000",
    "https://hospital.org",
    "http://localhost:4200",
  ]
