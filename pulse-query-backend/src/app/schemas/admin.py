"""Schema definitions for admin settings operations."""

from typing import Dict, List

from pydantic import BaseModel


class AdminSettingsResponse(BaseModel):
  """Response schema containing the currently configured admin settings."""

  api_keys: dict[str, str]
  visible_models: list[str]


class AdminSettingsUpdateRequest(BaseModel):
  """Request schema for updating admin settings."""

  api_keys: dict[str, str]
  visible_models: list[str]
