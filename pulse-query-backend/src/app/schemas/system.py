"""
System Health and Diagnostics Pydantic Schemas.

Defines schemas for reporting system health, database connectivity,
storage diagnostics, and configuration warnings.
"""

from typing import Any
from pydantic import BaseModel, Field


class DiagnosticWarningSchema(BaseModel):
  """Schema for diagnostic warning items."""

  code: str = Field(description="Unique code identifying the warning category.")
  message: str = Field(description="Human-readable warning message.")
  severity: str = Field(description="Severity classification (e.g., info, warning, critical).")
  remediation: str = Field(description="Recommended troubleshooting action.")
  timestamp: str = Field(description="ISO timestamp when warning was recorded.")


class PostgresHealthSchema(BaseModel):
  """Schema for PostgreSQL status."""

  status: str = Field(description="Connection status (e.g. connected, error, unknown).")
  latency_ms: float | None = Field(default=None, description="Response latency in milliseconds.")
  details: str | None = Field(default=None, description="Diagnostic details or host information.")
  error: str | None = Field(default=None, description="Error message if connection failed.")


class DuckDbHealthSchema(BaseModel):
  """Schema for DuckDB analytics engine status."""

  status: str = Field(description="Storage and query engine status (e.g. ready, error).")
  path: str | None = Field(default=None, description="Database file path.")
  tables: dict[str, int] = Field(default_factory=dict, description="Map of table names to row counts.")
  total_tables: int = Field(default=0, description="Total number of registered analytics tables.")
  error: str | None = Field(default=None, description="Error message if storage validation failed.")


class DataHealthSchema(BaseModel):
  """Schema for clinical dataset health and availability."""

  has_default_data: bool = Field(description="True if default hospital_data.csv was found.")
  fallback_generated: bool = Field(description="True if synthetic fallback sample data was generated.")
  missing_files: list[str] = Field(default_factory=list, description="List of expected files not found.")
  row_counts: dict[str, int] = Field(default_factory=dict, description="Row count per ingested dataset.")


class TemplateHealthSchema(BaseModel):
  """Schema for template seeder pack health."""

  templates_loaded: int = Field(description="Number of widget templates seeded into database.")
  has_templates: bool = Field(description="True if one or more templates are available.")
  missing_file: bool = Field(description="True if initial_templates.json was missing.")


class LlmHealthSchema(BaseModel):
  """Schema for LLM swarm configuration and readiness."""

  providers_count: int = Field(description="Number of configured LLM providers.")
  mock_mode: bool = Field(description="True if running in mock/fallback AI mode.")
  models: list[str] = Field(default_factory=list, description="List of active model display names.")


class SystemHealthResponse(BaseModel):
  """Schema for aggregated system health response."""

  overall_status: str = Field(description="Overall health status: healthy, degraded, or critical.")
  timestamp: str = Field(description="ISO timestamp of health assessment.")
  postgres: PostgresHealthSchema = Field(description="Relational database health.")
  duckdb: DuckDbHealthSchema = Field(description="OLAP analytics database health.")
  data: DataHealthSchema = Field(description="Data readiness and ingestion health.")
  templates: TemplateHealthSchema = Field(description="Template registry health.")
  llm: LlmHealthSchema = Field(description="LLM provider configuration health.")
  warnings: list[DiagnosticWarningSchema] = Field(default_factory=list, description="Active diagnostic warnings.")


class TroubleshootingStep(BaseModel):
  """Schema for a copyable troubleshooting remediation step."""

  title: str = Field(description="Step title or action description.")
  command: str | None = Field(default=None, description="Copyable terminal command.")
  description: str = Field(description="Contextual explanation for why this step resolves the issue.")


class SystemDiagnosticsResponse(BaseModel):
  """Schema for comprehensive system diagnostics and troubleshooting guides."""

  health: SystemHealthResponse = Field(description="Current system health summary.")
  environment_checks: dict[str, Any] = Field(description="Environment variables and runtime parameters.")
  troubleshooting_guides: list[TroubleshootingStep] = Field(
    default_factory=list, description="Curated troubleshooting steps."
  )


class ReingestResponse(BaseModel):
  """Schema for dataset re-ingestion operation result."""

  success: bool = Field(description="True if re-ingestion completed without fatal errors.")
  message: str = Field(description="Status message describing the result.")
  tables: dict[str, int] = Field(default_factory=dict, description="Updated table row counts.")
