"""
Application configuration.

Loads settings from environment variables and provides computed properties
used across the backend (database URLs, LLM swarm configuration, etc.).
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Dict, Any, Tuple, Optional

# Calculate absolute path to .env file (Root of backend)
# File structure: backend/src/app/core/config.py
# .parents[0] = core
# .parents[1] = app
# .parents[2] = src
# .parents[3] = backend  <-- The distinct root where .env lives
BACKEND_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = BACKEND_ROOT / ".env"


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
  POSTGRES_DB: str = "pulse_query_db"
  POSTGRES_PORT: int = 5432

  # Database: DuckDB
  DUCKDB_PATH: str = "hospital_analytics.duckdb"

  # --- Caching Settings ---
  CACHE_TTL_SECONDS: int = 300
  CACHE_MAX_ENTRIES: int = 1000
  CACHE_MAX_ITEM_SIZE: int = 5_000_000

  # --- LLM Configuration Fields ---

  # Local Custom
  LLM_LOCAL_URL: str = "http://localhost:11434/v1"
  LLM_LOCAL_API_KEY: str = "EMPTY"
  LLM_LOCAL_MODELS: str = ""

  # Ollama (Auto-Detected)
  OLLAMA_HOST: str = "http://localhost:11434/v1"
  OLLAMA_MODELS: str = ""

  # Cloud Providers
  OPENAI_API_KEY: Optional[str] = None
  OPENAI_MODELS: str = ""

  GEMINI_API_KEY: Optional[str] = None
  GOOGLE_API_KEY: Optional[str] = None
  GOOGLE_GEMINI_BASE_URL: Optional[str] = None
  GEMINI_MODELS: str = ""

  MISTRAL_API_KEY: Optional[str] = None
  MISTRAL_MODELS: str = ""

  ANTHROPIC_API_KEY: Optional[str] = None
  ANTHROPIC_MODELS: str = ""

  @property
  def SQLALCHEMY_DATABASE_URI(self) -> str:
    """Constructs the async PostgreSQL connection string from environment variables."""
    return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

  @property
  def LLM_SWARM(self) -> List[Dict[str, Any]]:
    """
    Compiles the configuration for all active LLM providers.
    Parses definitions for local execution and cloud APIs, standardizing tags for the Arena.
    """
    swarm = []

    def _parse_models(raw_csv: str, fallback: List[str] | None = None) -> List[Tuple[str, str]]:
      raw = raw_csv.strip()
      if not raw:
        if fallback:
          return [(m, m) for m in fallback]
        return []

      parsed = []
      for part in raw.split(","):
        clean = part.strip()
        if not clean:
          continue

        if "|" in clean:
          mid, name = clean.split("|", 1)
          parsed.append((mid.strip(), name.strip()))
        else:
          parsed.append((clean, clean))
      return parsed

    def _display_name(
      provider: str, model_id: str, raw_name: str, local: bool = False, include_model: bool = True
    ) -> str:
      is_custom_label = raw_name != model_id and raw_name.strip() != ""
      if is_custom_label:
        return raw_name

      model_lower = model_id.lower()
      if "deepseek-r1" in model_lower:
        final_name = "DeepSeek R1"
      elif "deepseek-coder" in model_lower:
        final_name = "DeepSeek Coder"
      elif "qwen2.5-coder" in model_lower:
        final_name = "Qwen 2.5 Coder"
      elif provider == "openai" and "gpt-4o" in model_lower:
        final_name = "GPT-4o"
      elif provider == "mistral" and "mistral-large" in model_lower:
        final_name = "Mistral Large"
      elif provider == "anthropic" and "claude-3-opus" in model_lower:
        final_name = "Claude 3 Opus"
      elif provider == "gemini" and "gemini-1.5-pro" in model_lower:
        final_name = "Gemini 1.5 Pro"
      elif local and model_id == "local-model":
        final_name = "Local Model"
      else:
        final_name = model_id.replace("-", " ").title()

      if local and include_model:
        if not final_name.startswith("Local"):
          return f"Local LLM: {final_name}"

      return final_name

    def _add_models(
      provider: str,
      models: List[Tuple[str, str]],
      api_key: str | None,
      api_base: str | None,
      local: bool = False,
      include_model_in_name: bool = True,
    ) -> None:
      for model_id, display_label in models:
        final_name = _display_name(provider, model_id, display_label, local=local, include_model=include_model_in_name)

        swarm.append(
          {
            "provider": provider,
            "model": model_id,
            "api_key": api_key,
            "api_base": api_base,
            "name": final_name,
            "model_name": model_id,
            "is_local": local,
          }
        )

    # 1. Local / Default Configuration (Manual Override)
    local_models_list = _parse_models(self.LLM_LOCAL_MODELS, [])
    if local_models_list:
      _add_models(
        provider="openai",
        models=local_models_list,
        api_key=self.LLM_LOCAL_API_KEY,
        api_base=self.LLM_LOCAL_URL,
        local=True,
        include_model_in_name=True,
      )

    # 2. OpenAI Cloud
    if self.OPENAI_API_KEY:
      openai_models = _parse_models(self.OPENAI_MODELS, ["gpt-4o"])
      _add_models(provider="openai", models=openai_models, api_key=self.OPENAI_API_KEY, api_base=None)

    # 3. Gemini Cloud
    if self.GEMINI_API_KEY or self.GOOGLE_API_KEY:
      gemini_m = _parse_models(self.GEMINI_MODELS, ["gemini-1.5-pro"])
      _add_models(
        provider="gemini",
        models=gemini_m,
        api_key=self.GEMINI_API_KEY or self.GOOGLE_API_KEY,
        api_base=self.GOOGLE_GEMINI_BASE_URL,
      )

    # 4. Ollama Local Models
    ollama_m = _parse_models(self.OLLAMA_MODELS, [])
    if ollama_m:
      _add_models(
        provider="openai",
        models=ollama_m,
        api_key="ollama",
        api_base=self.OLLAMA_HOST,
        local=True,
        include_model_in_name=True,
      )

    # 5. Mistral Cloud
    if self.MISTRAL_API_KEY:
      mistral_m = _parse_models(self.MISTRAL_MODELS, ["mistral-large-latest"])
      _add_models(provider="mistral", models=mistral_m, api_key=self.MISTRAL_API_KEY, api_base=None)

    # 6. Anthropic Cloud
    if self.ANTHROPIC_API_KEY:
      anthropic_m = _parse_models(self.ANTHROPIC_MODELS, ["claude-3-opus-20240229"])
      _add_models(provider="anthropic", models=anthropic_m, api_key=self.ANTHROPIC_API_KEY, api_base=None)

    return swarm

  model_config = SettingsConfigDict(env_file=str(ENV_PATH), case_sensitive=True, extra="ignore")


settings = Settings()
