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
  """

  api_keys: dict[str, str] = Field(default_factory=dict)
  visible_models: list[str] = Field(default_factory=list)
  configured_models: list[str] = Field(default_factory=list)
  ollama_api_base: str | None = None


class AdminSettingsUpdateRequest(BaseModel):
  """
  Request schema for updating admin settings.

  Attributes:
      api_keys (dict[str, str]): Map of provider slugs to configured API keys.
      visible_models (list[str]): List of visible model IDs.
      configured_models (list[str] | None): Optional list of `any-llm` model identifiers (`provider/model`).
      ollama_api_base (str | None): Optional custom Ollama base URL override.
  """

  api_keys: dict[str, str] = Field(default_factory=dict)
  visible_models: list[str] = Field(default_factory=list)
  configured_models: list[str] | None = None
  ollama_api_base: str | None = None
