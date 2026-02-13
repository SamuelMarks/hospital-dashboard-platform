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
  max_rows: Optional[int] = Field(default=100, ge=1, le=1000)
  global_params: Dict[str, Any] = Field(default_factory=dict)


class SQLExecutionResponse(BaseModel):
  """
  Response model containing SQL execution results.
  """

  data: List[Dict[str, Any]]
  columns: List[str]
  error: Optional[str] = None
