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
  # We instantiate Settings with explicit overrides to ignore .env content
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


def test_llm_swarm_mixed_provider_mapping() -> None:
  """
  Verify robust mapping across different providers (Ollama Local + Gemini Cloud).
  We simulate this by passing the raw strings into the Settings constructor.
  """
  settings = Settings(
    # Local models defined manually
    LLM_LOCAL_MODELS="gemma:2b|Model 0",
    # Gemini defined manually
    GEMINI_API_KEY="fake-key",
    GEMINI_MODELS="gemini-1.5-pro|Model 1",
    # Ensure isolation
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    OLLAMA_MODELS="",
  )

  swarm = settings.LLM_SWARM

  # Find Model 0
  m0 = next((s for s in swarm if s["name"] == "Model 0"), None)
  assert m0 is not None
  assert m0["provider"] == "openai"
  assert m0["model_name"] == "gemma:2b"

  # Find Model 1
  m1 = next((s for s in swarm if s["name"] == "Model 1"), None)
  assert m1 is not None
  assert m1["provider"] == "gemini"
  assert m1["model_name"] == "gemini-1.5-pro"


def test_llm_swarm_auto_ollama_fallback() -> None:
  """Verify that OLLAMA_MODELS field is picked up independently."""
  settings = Settings(
    OLLAMA_MODELS="qwen2:0.5b|Qwen Tiny",
    # Isolate from real environment keys
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    GEMINI_API_KEY=None,
    GOOGLE_API_KEY=None,
    LLM_LOCAL_MODELS="",
  )

  swarm = settings.LLM_SWARM

  # Should only have 1 model
  assert len(swarm) == 1
  assert swarm[0]["model_name"] == "qwen2:0.5b"
  assert "Qwen Tiny" in swarm[0]["name"]


def test_llm_swarm_includes_multiple_providers() -> None:
  """Verify the swarm expands for multiple clouds."""
  settings = Settings(
    OPENAI_API_KEY="k-openai",
    MISTRAL_API_KEY="k-mistral",
    ANTHROPIC_API_KEY="k-anthropic",
    # Set OLLAMA empty to isolate test
    OLLAMA_MODELS="",
    LLM_LOCAL_MODELS="",
    GEMINI_API_KEY=None,
    GOOGLE_API_KEY=None,
  )

  swarm = settings.LLM_SWARM

  # 3 cloud providers
  assert len(swarm) == 3
  names = {item["name"] for item in swarm}

  assert "GPT-4o" in names
  assert "Mistral Large" in names
  assert "Claude 3 Opus" in names
