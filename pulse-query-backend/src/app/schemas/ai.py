"""
AI Domain Schemas.

This module defines the Pydantic models used for the AI/LLM interaction endpoints,
specifically for the Text-to-SQL generation feature.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SQLGenerationRequest(BaseModel):
  """
  Request model for generating SQL from natural language.
  """

  prompt: str


class SQLGenerationResponse(BaseModel):
  """
  Response model containing the generated SQL query.
  """

  sql: str

  model_config = ConfigDict(from_attributes=True)


class SQLExecutionRequest(BaseModel):
  """
  Request model for executing SQL and returning a preview result.
  """

  sql: str
  max_rows: int | None = Field(default=100, ge=1, le=1000)
  global_params: dict[str, Any] = Field(default_factory=dict)


class SQLExecutionResponse(BaseModel):
  """
  Response model containing SQL execution results.
  """

  data: list[dict[str, Any]]
  columns: list[str]
  error: str | None = None


class ModelInfo(BaseModel):
  """
  Information about a configured LLM in the Arena.
  """

  id: str
  name: str
  provider: str
  is_local: bool
