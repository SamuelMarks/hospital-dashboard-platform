"""
AI Domain Schemas.

This module defines the Pydantic models used for the AI/LLM interaction endpoints,
specifically for the Text-to-SQL generation feature.
"""

from pydantic import BaseModel, ConfigDict


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
