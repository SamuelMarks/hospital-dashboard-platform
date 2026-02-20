"""
Tests for application configuration helpers.
"""

from app.core.config import Settings
import os


def test_sqlalchemy_database_uri_builds_expected_url() -> None:
  """Ensure the computed SQLAlchemy URI matches expected formatting."""
  # Note: Pydantic settings are immutable after init usually, so we pass via constructor
  settings = Settings(
    POSTGRES_SERVER="db.local",
    POSTGRES_USER="alice",
    POSTGRES_PASSWORD="secret",
    POSTGRES_DB="analytics",
    POSTGRES_PORT=5433,
    # Isolate from real env
    OLLAMA_MODELS="",
    LLM_LOCAL_MODELS="",
  )

  assert settings.SQLALCHEMY_DATABASE_URI == "postgresql+asyncpg://alice:secret@db.local:5433/analytics"


def test_llm_swarm_defaults_to_empty(monkeypatch) -> None:
  """Ensure default behavior is an empty list if no env vars are set."""
  # Clear all relevant keys to simulate clean env
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

  # Updated Logic: We no longer default to a broken "local-model"
  assert len(swarm) == 0


def test_llm_swarm_exhaustive_parsing() -> None:
  """
  Provides exhaustive coverage to hit all branches of internal `_display_name`
  and `_parse_models` within the Settings class.
  """
  settings = Settings(
    # hits empty strings and fallback loop branches
    LLM_LOCAL_MODELS="just-model-id,  ,",
    OPENAI_API_KEY="x",
    OPENAI_MODELS="",  # Tests empty fallback to ["gpt-4o"]
    GEMINI_API_KEY="x",
    GEMINI_MODELS="gemini-1.5-pro",
    OLLAMA_MODELS=(
      "deepseek-r1|Local DS,deepseek-coder:base,qwen2.5-coder,gpt-4o,mistral-large,claude-3-opus,local-model"
    ),
    MISTRAL_API_KEY="x",
    MISTRAL_MODELS="mistral-large",
    ANTHROPIC_API_KEY="x",
    ANTHROPIC_MODELS="claude-3-opus",
  )

  swarm = settings.LLM_SWARM
  names = {item["name"] for item in swarm}

  # Validated mapped heuristic names
  assert "Local DS" in names
  assert "Local LLM: DeepSeek Coder" in names
  assert "Local LLM: Qwen 2.5 Coder" in names
  assert "Local LLM: GPT-4o" in names
  assert "Local LLM: Mistral Large" in names
  assert "Local LLM: Claude 3 Opus" in names
  assert "Local Model" in names

  # Validate split logic hit
  assert "just-model-id" in [m["model_name"] for m in swarm]

  # Cloud default parsing
  assert "GPT-4o" in names
  assert "Gemini 1.5 Pro" in names


def test_llm_swarm_mixed_provider_mapping() -> None:
  """
  Verify robust mapping across different providers.
  """
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
