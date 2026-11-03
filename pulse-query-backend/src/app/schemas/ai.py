"""
AI Domain Schemas.

This module defines the Pydantic models used for the AI/LLM interaction endpoints,
specifically for the Text-to-SQL generation feature, model discovery, and live
connection health verification.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.json_types import JsonObject, SqlRow

ProcessorType = Literal["SQL", "OLLAMA", "ANY_LLM", "GEMMA_4_SQL", "GEMINI"]

LlmConnectionStatus = Literal[
  "connected",
  "degraded",
  "offline",
  "unconfigured",
  "auth_error",
  "crashed",
  "error",
]


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
      provider (str): Provider slug (`'sql'`, `'ollama'`, `'openai'`, `'gemini'`, `'gemma4sql'`, etc.).
      is_local (bool): True if the processor executes locally (DuckDB SQL, `gemma-4-sql`, or local Ollama).
      processor_type (ProcessorType): High-level processor category (`'SQL'`, `'OLLAMA'`, `'ANY_LLM'`, `'GEMMA_4_SQL'`, or `'GEMINI'`).
      status (LlmConnectionStatus): Current connection health status of the model/provider.
      latency_ms (float | None): Last measured probe or generation latency in milliseconds.
      error_message (str | None): Diagnostic error message when status is unhealthy.
      remediation (str | None): Actionable remediation advice when status is unhealthy.
      supports_sql_generation (bool): True if the processor converts natural language into SQL.
      supports_streaming (bool): True if the processor supports token streaming.
      backend_engine (str | None): Underlying execution engine (e.g. `'duckdb'`, `'mlx'`, `'jax'`, `'any-llm'`).
  """

  id: str
  name: str
  provider: str
  is_local: bool
  processor_type: ProcessorType = "ANY_LLM"
  status: LlmConnectionStatus = "connected"
  latency_ms: float | None = None
  error_message: str | None = None
  remediation: str | None = None
  supports_sql_generation: bool = True
  supports_streaming: bool = True
  backend_engine: str | None = None


class LlmProviderHealthResponse(BaseModel):
  """
  Live connection validation result for a single LLM provider or model combatant.

  Attributes:
      provider (str): Provider slug (`'ollama'`, `'gemini'`, `'gemma4sql'`, `'openai'`, etc.).
      model_id (str): Canonical model identifier (`'ollama:llama3'`, `'gemma4sql:google/gemma-4-sql-9b'`).
      display_name (str): Human-friendly display name.
      processor_type (ProcessorType): Processor classification category.
      is_local (bool): True if hosted locally.
      status (LlmConnectionStatus): Connection validity status (`'connected'`, `'offline'`, `'auth_error'`, `'crashed'`, etc.).
      latency_ms (float | None): Round-trip probe latency in milliseconds.
      message (str): Human-readable status summary.
      error_code (str | None): Canonical `ErrorCode` string if probe failed.
      remediation (str | None): Recommended fix command or configuration guidance.
      checked_at (datetime): UTC timestamp when the health probe completed.
  """

  provider: str
  model_id: str
  display_name: str
  processor_type: ProcessorType = "ANY_LLM"
  is_local: bool = False
  status: LlmConnectionStatus = "connected"
  latency_ms: float | None = None
  message: str = "Connection healthy"
  error_code: str | None = None
  remediation: str | None = None
  checked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LlmConnectionTestRequest(BaseModel):
  """
  Request payload to verify connectivity and optional 1-token inference for an LLM provider/model.

  Attributes:
      provider (str): Provider slug (`'ollama'`, `'gemini'`, `'gemma4sql'`, `'openai'`, etc.).
      model_id (str | None): Target model identifier to verify.
      api_key (str | None): Optional API key override to test before saving.
      api_base (str | None): Optional custom API base URL override to test.
      gemma4_sql_backend (str | None): Optional `gemma-4-sql` backend engine (`'mlx'`, `'jax'`, `'pytorch'`, `'api'`).
      run_inference_smoke_test (bool): If True, executes a minimal 1-token/SQL smoke generation to detect crashes.
  """

  provider: str
  model_id: str | None = None
  api_key: str | None = None
  api_base: str | None = None
  gemma4_sql_backend: str | None = None
  run_inference_smoke_test: bool = False


class LlmHealthSummaryResponse(BaseModel):
  """
  Aggregated connection health summary across all configured LLM models and read-only DuckDB.

  Attributes:
      overall_status (LlmConnectionStatus): Aggregate status across configured models.
      active_count (int): Total number of configured/discovered models evaluated.
      healthy_count (int): Number of models with `'connected'` status.
      unhealthy_count (int): Number of models with offline, auth, or crash errors.
      mock_mode (bool): True if no real LLM providers are configured and fallback mock is active.
      duckdb_readonly_ready (bool): True if the read-only DuckDB analytics connection is healthy.
      providers (list[LlmProviderHealthResponse]): Per-model connection probe results.
  """

  overall_status: LlmConnectionStatus = "connected"
  active_count: int = 0
  healthy_count: int = 0
  unhealthy_count: int = 0
  mock_mode: bool = False
  duckdb_readonly_ready: bool = True
  providers: list[LlmProviderHealthResponse] = Field(default_factory=list)
