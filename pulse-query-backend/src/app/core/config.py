"""
Application configuration.

Loads settings from environment variables and provides computed properties
used across the backend (database URLs, LLM swarm configuration, etc.).
"""

import os
from pathlib import Path
from typing import TypedDict

from pydantic_settings import BaseSettings, SettingsConfigDict

# Calculate absolute path to .env file (Root of backend)
# File structure: pulse-query-backend/src/app/core/config.py
# .parents[0] = core
# .parents[1] = app
# .parents[2] = src
# .parents[3] = backend  <-- The distinct root where .env lives
BACKEND_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = BACKEND_ROOT / ".env"


class SwarmConfigDict(TypedDict):
  """
  Typed dictionary representing a normalized LLM provider entry in `Settings.LLM_SWARM`.

  Attributes:
      provider (str): Provider slug (`openai`, `gemini`, `mistral`, `anthropic`).
      model (str): Model identifier string.
      api_key (str | None): Configured API key or None.
      api_base (str | None): Optional custom API base URL.
      name (str): Human-friendly display label for the Arena UI.
      model_name (str): Target model identifier passed to completion calls.
      is_local (bool): True if hosted on a local inference endpoint.
  """

  provider: str
  model: str
  api_key: str | None
  api_base: str | None
  name: str
  model_name: str
  is_local: bool


# Provider-specific display name rules mapped by (provider_or_none, substring_match) -> display_name
_KNOWN_DISPLAY_NAMES: tuple[tuple[str | None, str, str], ...] = (
  (None, "deepseek-r1", "DeepSeek R1"),
  (None, "deepseek-coder", "DeepSeek Coder"),
  (None, "qwen2.5-coder", "Qwen 2.5 Coder"),
  ("openai", "gpt-4o", "GPT-4o"),
  ("mistral", "mistral-large", "Mistral Large"),
  ("anthropic", "claude-3-opus", "Claude 3 Opus"),
  ("gemini", "gemini-1.5-pro", "Gemini 1.5 Pro"),
)


def _parse_model_entries(raw_csv: str, fallback: list[str] | None = None) -> list[tuple[str, str]]:
  """
  Parses comma-separated model identifiers and optional display names (`id|label`).

  Args:
      raw_csv (str): Comma-separated string of model definitions.
      fallback (list[str] | None): Optional default model list if `raw_csv` is empty.

  Returns:
      list[tuple[str, str]]: List of `(model_id, display_label)` tuples.
  """
  raw = raw_csv.strip()
  if not raw:
    return [(m, m) for m in fallback] if fallback else []

  parsed: list[tuple[str, str]] = []
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


def _resolve_model_display_name(
  provider: str, model_id: str, raw_name: str, local: bool = False, include_model: bool = True
) -> str:
  """
  Resolves a human-friendly display label for an LLM provider and model identifier.

  Args:
      provider (str): Provider slug (e.g., `openai`, `anthropic`, `gemini`).
      model_id (str): Raw model identifier string.
      raw_name (str): User-supplied label or raw model identifier.
      local (bool): Whether the model is hosted on a local inference endpoint.
      include_model (bool): Whether to prefix local models with `Local LLM:`.

  Returns:
      str: Standardized display name for the Arena UI.
  """
  if raw_name != model_id and raw_name.strip() != "":
    return raw_name

  model_lower = model_id.lower()
  final_name: str | None = None
  for req_provider, substr, label in _KNOWN_DISPLAY_NAMES:
    if substr in model_lower and (req_provider is None or req_provider == provider):
      final_name = label
      break

  if final_name is None:
    final_name = "Local Model" if (local and model_id == "local-model") else model_id.replace("-", " ").title()

  if local and include_model and not final_name.startswith("Local"):
    return f"Local LLM: {final_name}"

  return final_name


class Settings(BaseSettings):
  """Strongly-typed configuration settings for the backend."""

  PROJECT_NAME: str = "Hospital Analytics Platform"
  API_V1_STR: str = "/api/v1"

  # Security
  SECRET_KEY: str = "CHANGEME_IN_PROD_SUPER_SECRET_KEY"
  ALGORITHM: str = "HS256"
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

  # PostgreSQL async database connection settings
  POSTGRES_SERVER: str = "localhost"
  POSTGRES_USER: str = "postgres"
  POSTGRES_PASSWORD: str = "postgres"
  POSTGRES_DB: str = "pulse_query_db"
  POSTGRES_PORT: int = 5432

  # DuckDB analytical engine settings
  DUCKDB_PATH: str = "hospital_analytics.duckdb"
  AUTO_INGEST_INTERVAL_MINUTES: int = 0

  # --- CORS Configuration ---
  BACKEND_CORS_ORIGINS: list[str] | str = [
    "http://localhost:4200",
    "http://localhost:8000",
    "http://127.0.0.1:4200",
    "http://127.0.0.1:8000",
  ]

  @property
  def parsed_cors_origins(self) -> list[str]:
    """
    Returns validated list of permitted CORS origin strings.

    Returns:
        list[str]: Trimmed list of allowed origin URLs.
    """
    if isinstance(self.BACKEND_CORS_ORIGINS, str):
      return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]
    return [str(origin).strip() for origin in self.BACKEND_CORS_ORIGINS if str(origin).strip()]

  # --- Caching Settings ---
  CACHE_TTL_SECONDS: int = 300
  CACHE_MAX_ENTRIES: int = 1000
  CACHE_MAX_ITEM_SIZE: int = 5_000_000

  # --- Email / SMTP Settings ---
  SMTP_HOST: str | None = None
  SMTP_PORT: int = 587
  SMTP_USER: str | None = None
  SMTP_PASSWORD: str | None = None
  SMTP_TLS: bool = True
  EMAILS_FROM_EMAIL: str = "noreply@hospital-platform.local"
  FRONTEND_URL: str = "http://localhost:4200"

  # --- LLM Configuration Fields ---

  # Local Custom
  LLM_LOCAL_URL: str = "http://localhost:11434/v1"
  LLM_LOCAL_API_KEY: str = "EMPTY"
  LLM_LOCAL_MODELS: str = ""

  # Ollama auto-detected endpoint settings
  OLLAMA_HOST: str = "http://localhost:11434/v1"
  OLLAMA_MODELS: str = ""

  # Cloud Providers
  OPENAI_API_KEY: str | None = None
  OPENAI_MODELS: str = ""

  GEMINI_API_KEY: str | None = None
  GOOGLE_API_KEY: str | None = None
  GOOGLE_GEMINI_BASE_URL: str | None = None
  GEMINI_MODELS: str = ""

  MISTRAL_API_KEY: str | None = None
  MISTRAL_MODELS: str = ""

  ANTHROPIC_API_KEY: str | None = None
  ANTHROPIC_MODELS: str = ""

  @property
  def SQLALCHEMY_DATABASE_URI(self) -> str:
    """
    Constructs the async PostgreSQL (or SQLite test override) connection string.

    Returns:
        str: SQLAlchemy async database URI.
    """
    if os.environ.get("USE_SQLITE_ALEMBIC") == "1":
      return "sqlite+aiosqlite:///e2e_test.db"
    return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

  def _append_swarm_group(
    self,
    swarm: list[SwarmConfigDict],
    provider: str,
    models: list[tuple[str, str]],
    api_key: str | None,
    api_base: str | None,
    local: bool = False,
  ) -> None:
    """
    Appends normalized model configuration dictionaries to the active `swarm` list.

    Args:
        swarm (list[SwarmConfigDict]): Target swarm list to mutate.
        provider (str): Provider identifier string.
        models (list[tuple[str, str]]): List of `(model_id, display_label)` pairs.
        api_key (str | None): Provider API key if applicable.
        api_base (str | None): Custom base URL override if applicable.
        local (bool): True if the endpoint is a local server.
    """
    for model_id, display_label in models:
      final_name = _resolve_model_display_name(provider, model_id, display_label, local=local, include_model=True)
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

  @property
  def LLM_SWARM(self) -> list[SwarmConfigDict]:
    """
    Compiles the configuration for all active LLM providers.
    Parses definitions for local execution and cloud APIs, standardizing tags for the Arena.

    Returns:
        list[SwarmConfigDict]: List of active LLM provider configurations.
    """
    swarm: list[SwarmConfigDict] = []

    provider_specs: list[tuple[bool, str, str, list[str], str | None, str | None, bool]] = [
      (
        bool(self.LLM_LOCAL_MODELS.strip()),
        "openai",
        self.LLM_LOCAL_MODELS,
        [],
        self.LLM_LOCAL_API_KEY,
        self.LLM_LOCAL_URL,
        True,
      ),
      (bool(self.OPENAI_API_KEY), "openai", self.OPENAI_MODELS, ["gpt-4o"], self.OPENAI_API_KEY, None, False),
      (
        bool(self.GEMINI_API_KEY or self.GOOGLE_API_KEY),
        "gemini",
        self.GEMINI_MODELS,
        ["gemini-1.5-pro"],
        self.GEMINI_API_KEY or self.GOOGLE_API_KEY,
        self.GOOGLE_GEMINI_BASE_URL,
        False,
      ),
      (bool(self.OLLAMA_MODELS.strip()), "openai", self.OLLAMA_MODELS, [], "ollama", self.OLLAMA_HOST, True),
      (
        bool(self.MISTRAL_API_KEY),
        "mistral",
        self.MISTRAL_MODELS,
        ["mistral-large-latest"],
        self.MISTRAL_API_KEY,
        None,
        False,
      ),
      (
        bool(self.ANTHROPIC_API_KEY),
        "anthropic",
        self.ANTHROPIC_MODELS,
        ["claude-3-opus-20240229"],
        self.ANTHROPIC_API_KEY,
        None,
        False,
      ),
    ]

    for enabled, provider, raw_models, fallback, api_key, api_base, is_local in provider_specs:
      if enabled:
        models = _parse_model_entries(raw_models, fallback)
        self._append_swarm_group(swarm, provider, models, api_key, api_base, local=is_local)

    return swarm

  model_config = SettingsConfigDict(env_file=str(ENV_PATH), case_sensitive=True, extra="ignore")


settings = Settings()
