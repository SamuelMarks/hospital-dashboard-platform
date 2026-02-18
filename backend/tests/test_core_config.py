"""
Tests for application configuration helpers.
"""

from app.core.config import Settings


def test_sqlalchemy_database_uri_builds_expected_url() -> None:
  """Ensure the computed SQLAlchemy URI matches expected formatting."""
  settings = Settings(
    POSTGRES_SERVER="db.local",
    POSTGRES_USER="alice",
    POSTGRES_PASSWORD="secret",
    POSTGRES_DB="analytics",
    POSTGRES_PORT=5433,
  )

  assert settings.SQLALCHEMY_DATABASE_URI == "postgresql+asyncpg://alice:secret@db.local:5433/analytics"


def test_llm_swarm_configures_safe_local_defaults(monkeypatch) -> None:
  """Ensure default local URL prevents port collision with backend (8000)."""
  # Clear all external keys to trigger default path
  monkeypatch.delenv("OPENAI_API_KEY", raising=False)
  monkeypatch.delenv("LLM_LOCAL_URL", raising=False)

  settings = Settings()
  swarm = settings.LLM_SWARM

  local = next(s for s in swarm if s["name"] == "Local LLM")

  # Assert it defaults to Ollama port (11434) not FastAPI port (8000)
  assert "11434" in local["api_base"]
  assert "8000" not in local["api_base"]


def test_llm_swarm_includes_optional_providers(monkeypatch) -> None:
  """Verify the swarm expands when API keys are present."""
  monkeypatch.setenv("OPENAI_API_KEY", "k-openai")
  monkeypatch.setenv("MISTRAL_API_KEY", "k-mistral")
  monkeypatch.setenv("ANTHROPIC_API_KEY", "k-anthropic")

  settings = Settings()
  swarm = settings.LLM_SWARM

  # Local provider + 3 cloud providers
  assert len(swarm) == 4
  names = {item["name"] for item in swarm}
  assert "Local LLM" in names
  assert "GPT-4o" in names
  assert "Mistral Large" in names
  assert "Claude 3 Opus" in names


def test_llm_swarm_defaults_to_local_provider(monkeypatch) -> None:
  """Ensure the swarm still includes the local provider without any keys."""
  monkeypatch.delenv("OPENAI_API_KEY", raising=False)
  monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
  monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
  monkeypatch.delenv("GEMINI_API_KEY", raising=False)
  monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
  monkeypatch.delenv("OLLAMA_MODELS", raising=False)
  monkeypatch.delenv("LLM_LOCAL_MODELS", raising=False)

  settings = Settings()
  swarm = settings.LLM_SWARM

  assert len(swarm) == 1
  assert swarm[0]["name"] == "Local LLM"


def test_llm_swarm_parses_local_models_env(monkeypatch) -> None:
  """Custom local models should be parsed and labeled."""
  monkeypatch.setenv("LLM_LOCAL_MODELS", "local-a, local-b")
  monkeypatch.delenv("OPENAI_API_KEY", raising=False)
  monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
  monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
  monkeypatch.delenv("GEMINI_API_KEY", raising=False)
  monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
  monkeypatch.delenv("OLLAMA_MODELS", raising=False)

  settings = Settings()
  swarm = settings.LLM_SWARM

  assert len(swarm) == 2
  names = {item["name"] for item in swarm}
  assert "Local LLM local-a" in names
  assert "Local LLM local-b" in names


def test_llm_swarm_includes_gemini_and_ollama(monkeypatch) -> None:
  """Gemini and Ollama models should be added when configured."""
  monkeypatch.setenv("GEMINI_API_KEY", "k-gemini")
  monkeypatch.setenv("OLLAMA_MODELS", "llama3")
  monkeypatch.delenv("OPENAI_API_KEY", raising=False)
  monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
  monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
  monkeypatch.delenv("LLM_LOCAL_MODELS", raising=False)

  settings = Settings()
  swarm = settings.LLM_SWARM

  names = {item["name"] for item in swarm}
  assert "Gemini 1.5 Pro" in names
  assert "Llama3" in names
