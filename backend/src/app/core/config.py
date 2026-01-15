import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


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
  # We use a persistent local file for the hospital dataset
  DUCKDB_PATH: str = "hospital_analytics.duckdb"

  # LLM Settings
  LLM_API_URL: str = "http://localhost:8000/v1"

  # --- Caching Settings ---
  # Time in seconds before a cached result is considered stale (Default: 5 minutes)
  CACHE_TTL_SECONDS: int = 300
  # Maximum number of result sets to keep in memory (LRU)
  CACHE_MAX_ENTRIES: int = 1000
  # Maximum size of a single value to cache (approx chars) to prevent RAM explosion (Default: 5MB)
  CACHE_MAX_ITEM_SIZE: int = 5_000_000

  model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
