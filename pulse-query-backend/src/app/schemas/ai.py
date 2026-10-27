"""
AI Domain Schemas.

This module defines the Pydantic models used for the AI/LLM interaction endpoints,
specifically for the Text-to-SQL generation feature.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.json_types import JsonObject, SqlRow

ProcessorType = Literal["SQL", "OLLAMA", "ANY_LLM"]


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
  global_params: JsonObject = Field(default_factory=dict)


class SQLExecutionResponse(BaseModel):
  """
  Response model containing SQL execution results.
  """

  data: list[SqlRow]
  columns: list[str]
  error: str | None = None


class ModelInfo(BaseModel):
  """
  Information about a configured LLM or SQL processor in the platform.

  Attributes:
      id (str): Unique processor identifier (e.g. `'SQL'`, `'ollama/llama3'`, `'openai/gpt-4o'`).
      name (str): Human-readable display label (e.g. `'SQL [no model]'`, `'GPT-4o'`).
      provider (str): Provider slug (`'sql'`, `'ollama'`, `'openai'`, `'anthropic'`, etc.).
      is_local (bool): True if the processor executes locally (DuckDB SQL or local Ollama).
      processor_type (ProcessorType): High-level processor category (`'SQL'`, `'OLLAMA'`, or `'ANY_LLM'`).
  """

  id: str
  name: str
  provider: str
  is_local: bool
  processor_type: ProcessorType = "ANY_LLM"
