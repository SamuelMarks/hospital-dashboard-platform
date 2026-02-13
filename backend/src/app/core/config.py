"""
Application configuration.

Loads settings from environment variables and provides computed properties
used across the backend (database URLs, LLM swarm configuration, etc.).
"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Dict, Any


class Settings(BaseSettings):
  """Strongly-typed configuration settings for the backend."""

  PROJECT_NAME: str = "Hospital Analytics Platform"
  API_V1_STR: str = "/api/v1"

  # Security
  SECRET_KEY: str = "CHANGEME_IN_PROD_SUPER_SECRET_KEY"
  ALGORITHM: str = "HS256"
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

  # Database: PostgreSQL (Async)
  POSTGRES_SERVER: str = "localhost"
  POSTGRES_USER: str = "postgres"
  POSTGRES_PASSWORD: str = "postgres"
  POSTGRES_DB: str = "app_db"
  POSTGRES_PORT: int = int(os.environ.get("PGPORT", os.environ.get("POSTGRES_PORT", 5432)))

  @property
  def SQLALCHEMY_DATABASE_URI(self) -> str:
    """Build the async SQLAlchemy database URI from environment settings."""
    return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

  # Database: DuckDB
  DUCKDB_PATH: str = "hospital_analytics.duckdb"

  # --- Caching Settings ---
  CACHE_TTL_SECONDS: int = 300
  CACHE_MAX_ENTRIES: int = 1000
  CACHE_MAX_ITEM_SIZE: int = 5_000_000

  # --- Multi-LLM Arena Configuration ---
  # This section dynamically builds the "Swarm" of LLMs based on available API Keys.
  # It defaults to a local provider if no cloud keys are found.

  @property
  def LLM_SWARM(self) -> List[Dict[str, Any]]:
    """
    Returns a list of configured providers for the Arena.
    Structure: [{'provider': 'openai', 'model': 'gpt-4', 'api_key': '...'}, ...]
    """
    swarm = []

    def _parse_models(env_key: str, fallback: List[str] | None = None) -> List[str]:
      raw = os.environ.get(env_key, "").strip()
      if raw:
        return [m.strip() for m in raw.split(",") if m.strip()]
      return fallback or []

    def _display_name(provider: str, model: str, local: bool = False, include_model: bool = True) -> str:
      model_lower = model.lower()
      if local:
        return "Local LLM" if not include_model else f"Local LLM {model}"
      if provider == "openai" and model_lower == "gpt-4o":
        return "GPT-4o"
      if provider == "mistral" and model_lower.startswith("mistral-large"):
        return "Mistral Large"
      if provider == "anthropic" and model_lower.startswith("claude-3-opus"):
        return "Claude 3 Opus"
      if provider == "gemini" and model_lower.startswith("gemini-1.5-pro"):
        return "Gemini 1.5 Pro"
      return model.replace("-", " ").title()

    def _add_models(
      provider: str,
      models: List[str],
      api_key: str | None,
      api_base: str | None,
      local: bool = False,
      include_model_in_name: bool = True,
    ) -> None:
      for model in models:
        swarm.append(
          {
            "provider": provider,
            "model": model,
            "api_key": api_key,
            "api_base": api_base,
            "name": _display_name(provider, model, local=local, include_model=include_model_in_name),
          }
        )

    # 1. Local / Default Configuration (OpenAI-compatible; vLLM, LM Studio, etc.)
    local_models = _parse_models("LLM_LOCAL_MODELS", ["local-model"])
    local_url = os.environ.get("LLM_LOCAL_URL", "http://localhost:8000/v1")
    _add_models(
      provider="openai",
      models=local_models,
      api_key=os.environ.get("LLM_LOCAL_API_KEY", "EMPTY"),
      api_base=local_url,
      local=True,
      include_model_in_name=len(local_models) > 1,
    )

    # 2. OpenAI Cloud (If Key Present)
    if os.environ.get("OPENAI_API_KEY"):
      openai_models = _parse_models("OPENAI_MODELS", ["gpt-4o"])
      _add_models(
        provider="openai",
        models=openai_models,
        api_key=os.environ["OPENAI_API_KEY"],
        api_base=None,
      )

    # 3. Gemini Cloud (If Key Present)
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
      gemini_models = _parse_models("GEMINI_MODELS", ["gemini-1.5-pro"])
      _add_models(
        provider="gemini",
        models=gemini_models,
        api_key=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"),
        api_base=os.environ.get("GOOGLE_GEMINI_BASE_URL"),
      )

    # 4. Ollama Local Models (If Models Listed)
    ollama_models = _parse_models("OLLAMA_MODELS", [])
    if ollama_models:
      _add_models(
        provider="ollama",
        models=ollama_models,
        api_key=None,
        api_base=os.environ.get("OLLAMA_HOST"),
      )

    # 5. Mistral Cloud (If Key Present)
    if os.environ.get("MISTRAL_API_KEY"):
      mistral_models = _parse_models("MISTRAL_MODELS", ["mistral-large-latest"])
      _add_models(
        provider="mistral",
        models=mistral_models,
        api_key=os.environ["MISTRAL_API_KEY"],
        api_base=None,
      )

    # 6. Anthropic Cloud (If Key Present)
    if os.environ.get("ANTHROPIC_API_KEY"):
      anthropic_models = _parse_models("ANTHROPIC_MODELS", ["claude-3-opus-20240229"])
      _add_models(
        provider="anthropic",
        models=anthropic_models,
        api_key=os.environ["ANTHROPIC_API_KEY"],
        api_base=None,
      )

    return swarm

  model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
