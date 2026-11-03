"""Schema definitions for admin settings operations."""

from pydantic import BaseModel, Field


class AdminSettingsResponse(BaseModel):
  """
  Response schema containing the currently configured admin settings.

  Attributes:
      api_keys (dict[str, str]): Map of provider slugs to configured API keys.
      visible_models (list[str]): List of visible model IDs.
      configured_models (list[str]): Additional `provider/model` or `provider:model` entries registered for `any-llm`.
      ollama_api_base (str | None): Optional custom Ollama base URL override.
      gemma4_sql_enabled (bool): Whether the `gemma-4-sql` text-to-SQL engine is enabled.
      gemma4_sql_backend (str): Selected `gemma-4-sql` backend (`'mlx'`, `'jax'`, `'pytorch'`, `'keras'`, `'maxtext'`, `'api'`).
      gemma4_sql_model_name (str): Target `gemma-4-sql` model identifier.
      gemma4_sql_api_base (str | None): Optional `gemma-4-sql serve` HTTP endpoint URL.
  """

  api_keys: dict[str, str] = Field(default_factory=dict)
  visible_models: list[str] = Field(default_factory=list)
  configured_models: list[str] = Field(default_factory=list)
  ollama_api_base: str | None = None
  gemma4_sql_enabled: bool = True
  gemma4_sql_backend: str = "mlx"
  gemma4_sql_model_name: str = "google/gemma-4-sql-9b"
  gemma4_sql_api_base: str | None = None


class AdminSettingsUpdateRequest(BaseModel):
  """
  Request schema for updating admin settings.

  Attributes:
      api_keys (dict[str, str]): Map of provider slugs to configured API keys.
      visible_models (list[str]): List of visible model IDs.
      configured_models (list[str] | None): Optional list of `any-llm` model identifiers (`provider/model`).
      ollama_api_base (str | None): Optional custom Ollama base URL override.
      gemma4_sql_enabled (bool | None): Optional toggle for `gemma-4-sql`.
      gemma4_sql_backend (str | None): Optional `gemma-4-sql` backend override.
      gemma4_sql_model_name (str | None): Optional `gemma-4-sql` model identifier override.
      gemma4_sql_api_base (str | None): Optional `gemma-4-sql serve` endpoint override.
  """

  api_keys: dict[str, str] = Field(default_factory=dict)
  visible_models: list[str] = Field(default_factory=list)
  configured_models: list[str] | None = None
  ollama_api_base: str | None = None
  gemma4_sql_enabled: bool | None = None
  gemma4_sql_backend: str | None = None
  gemma4_sql_model_name: str | None = None
  gemma4_sql_api_base: str | None = None
