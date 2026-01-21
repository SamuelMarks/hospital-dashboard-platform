import os
import json
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Dict


class Settings(BaseSettings):
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
  def LLM_SWARM(self) -> List[Dict[str, str]]:
    """
    Returns a list of configured providers for the Arena.
    Structure: [{'provider': 'openai', 'model': 'gpt-4', 'api_key': '...'}, ...]
    """
    swarm = []

    # 1. Local / Default Configuration (Always Active)
    # Uses vLLM or similar local server compatible with OpenAI API
    swarm.append(
      {
        "provider": "openai",
        "model": "local-model",
        "api_key": "EMPTY",
        "base_url": os.environ.get("LLM_LOCAL_URL", "http://localhost:8000/v1"),
        "name": "Local LLM",
      }
    )

    # 2. OpenAI Cloud (If Key Present)
    if os.environ.get("OPENAI_API_KEY"):
      swarm.append({"provider": "openai", "model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"], "name": "GPT-4o"})

    # 3. Mistral Cloud (If Key Present)
    if os.environ.get("MISTRAL_API_KEY"):
      swarm.append(
        {
          "provider": "mistral",
          "model": "mistral-large-latest",
          "api_key": os.environ["MISTRAL_API_KEY"],
          "name": "Mistral Large",
        }
      )

    # 4. Anthropic Cloud (If Key Present)
    if os.environ.get("ANTHROPIC_API_KEY"):
      swarm.append(
        {
          "provider": "anthropic",
          "model": "claude-3-opus-20240229",
          "api_key": os.environ["ANTHROPIC_API_KEY"],
          "name": "Claude 3 Opus",
        }
      )

    return swarm

  model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
