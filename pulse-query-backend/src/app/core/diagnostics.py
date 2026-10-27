"""
Diagnostics and Health Monitoring Module.

Provides utilities to validate backend settings, verify database connectivity,
detect missing initial datasets or templates, generate human-friendly startup
diagnostic banners, and maintain an in-memory health registry.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Protocol, TypedDict

from app.core.config import SwarmConfigDict
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject, JsonPrimitive

logger = logging.getLogger("diagnostics")


class SettingsProtocol(Protocol):
  """
  Structural protocol representing the application settings inspected during startup hygiene checks.
  """

  @property
  def SECRET_KEY(self) -> str:
    """Application secret key."""

  @property
  def LLM_SWARM(self) -> Sequence[SwarmConfigDict | Mapping[str, JsonPrimitive]]:
    """Configured LLM swarm combatant mappings."""


class PostgresStatusDict(TypedDict):
  """Typed dictionary for PostgreSQL connectivity status."""

  status: str
  latency_ms: float | int | None
  details: str | None
  error: str | None


class DuckDbStatusDict(TypedDict):
  """Typed dictionary for DuckDB storage health status."""

  status: str
  path: str | None
  tables: dict[str, int]
  total_tables: int
  error: str | None


class DataStatusDict(TypedDict):
  """Typed dictionary for CSV data ingestion status."""

  status: str
  table_count: int
  tables: list[str]
  has_default_data: bool
  fallback_generated: bool
  missing_files: list[str]
  row_counts: dict[str, int]


class TemplateStatusDict(TypedDict):
  """Typed dictionary for template seeding status."""

  status: str
  template_count: int
  templates_loaded: int
  has_templates: bool
  missing_file: bool


class LlmStatusDict(TypedDict):
  """Typed dictionary for LLM swarm configuration status."""

  providers_count: int
  mock_mode: bool
  models: list[str]


@dataclass
class PostgresDiagnosticState:
  """
  Strongly typed diagnostic state model for PostgreSQL connectivity.

  Attributes:
      status (str): Connection status ("unknown", "connected", "error").
      latency_ms (float | int | None): Round-trip query latency in milliseconds.
      details (str | None): Human-readable connection description.
      error (str | None): Error message if connection failed.
  """

  status: str = "unknown"
  latency_ms: float | int | None = None
  details: str | None = None
  error: str | None = None

  def to_dict(self) -> PostgresStatusDict:
    """
    Serializes the PostgreSQL diagnostic state into a `PostgresStatusDict`.

    Returns:
        PostgresStatusDict: Dictionary representation of PostgreSQL health.
    """
    return {
      "status": self.status,
      "latency_ms": self.latency_ms,
      "details": self.details,
      "error": self.error,
    }


@dataclass
class DuckDBDiagnosticState:
  """
  Strongly typed diagnostic state model for DuckDB storage health.

  Attributes:
      status (str): Storage health status ("unknown", "ready", "error").
      path (str | None): Path to the DuckDB file or `:memory:`.
      tables (dict[str, int]): Mapping of table names to row counts.
      total_tables (int): Total number of tables discovered.
      error (str | None): Error message if storage validation failed.
  """

  status: str = "unknown"
  path: str | None = None
  tables: dict[str, int] = field(default_factory=dict)
  total_tables: int = 0
  error: str | None = None

  def to_dict(self) -> DuckDbStatusDict:
    """
    Serializes the DuckDB diagnostic state into a `DuckDbStatusDict`.

    Returns:
        DuckDbStatusDict: Dictionary representation of DuckDB storage health.
    """
    return {
      "status": self.status,
      "path": self.path,
      "tables": dict(self.tables),
      "total_tables": self.total_tables,
      "error": self.error,
    }


@dataclass
class DataDiagnosticState:
  """
  Strongly typed diagnostic state model for CSV clinical data ingestion.

  Attributes:
      status (str): Dataset population status ("empty", "ready", "critical").
      table_count (int): Number of distinct ingested tables.
      tables (list[str]): List of ingested table names.
      has_default_data (bool): True if the default clinical dataset was loaded.
      fallback_generated (bool): True if synthetic fallback data was generated.
      missing_files (list[str]): List of missing expected CSV filenames.
      row_counts (dict[str, int]): Mapping of table names to ingested row counts.
  """

  status: str = "empty"
  table_count: int = 0
  tables: list[str] = field(default_factory=list)
  has_default_data: bool = False
  fallback_generated: bool = False
  missing_files: list[str] = field(default_factory=list)
  row_counts: dict[str, int] = field(default_factory=dict)

  def to_dict(self) -> DataStatusDict:
    """
    Serializes the dataset ingestion diagnostic state into a `DataStatusDict`.

    Returns:
        DataStatusDict: Dictionary representation of clinical dataset health.
    """
    return {
      "status": self.status,
      "table_count": self.table_count,
      "tables": list(self.tables),
      "has_default_data": self.has_default_data,
      "fallback_generated": self.fallback_generated,
      "missing_files": list(self.missing_files),
      "row_counts": dict(self.row_counts),
    }


@dataclass
class TemplateDiagnosticState:
  """
  Strongly typed diagnostic state model for widget template seeding.

  Attributes:
      status (str): Seeding status ("empty", "ready", "critical").
      template_count (int): Total templates present in the database.
      templates_loaded (int): Number of templates processed during seeding.
      has_templates (bool): True if at least one template is available.
      missing_file (bool): True if `initial_templates.json` was missing on disk.
  """

  status: str = "empty"
  template_count: int = 0
  templates_loaded: int = 0
  has_templates: bool = False
  missing_file: bool = False

  def to_dict(self) -> TemplateStatusDict:
    """
    Serializes the template seeding diagnostic state into a `TemplateStatusDict`.

    Returns:
        TemplateStatusDict: Dictionary representation of template seeding health.
    """
    return {
      "status": self.status,
      "template_count": self.template_count,
      "templates_loaded": self.templates_loaded,
      "has_templates": self.has_templates,
      "missing_file": self.missing_file,
    }


@dataclass
class LlmDiagnosticState:
  """
  Strongly typed diagnostic state model for LLM swarm configuration.

  Attributes:
      providers_count (int): Number of configured LLM swarm combatants.
      mock_mode (bool): True if no live LLM keys are configured.
      models (list[str]): Names of configured LLM combatants.
  """

  providers_count: int = 0
  mock_mode: bool = True
  models: list[str] = field(default_factory=list)

  def to_dict(self) -> LlmStatusDict:
    """
    Serializes the LLM swarm diagnostic state into an `LlmStatusDict`.

    Returns:
        LlmStatusDict: Dictionary representation of LLM swarm health.
    """
    return {
      "providers_count": self.providers_count,
      "mock_mode": self.mock_mode,
      "models": list(self.models),
    }


@dataclass
class DiagnosticWarning:
  """
  Represents a warning emitted during startup or runtime diagnostics.

  Attributes:
      code (str): Unique identifier code for the warning category.
      message (str): Human-readable warning message.
      severity (str): Severity level ("warning", "error", "info").
      remediation (str): Actionable remediation guidance.
      timestamp (str): ISO 8601 formatted timestamp when the warning was generated.
  """

  code: str
  message: str
  severity: str
  remediation: str
  timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

  def to_dict(self) -> dict[str, str]:
    """
    Serializes the warning instance into a dictionary.

    Returns:
        dict[str, str]: Dictionary containing the warning details.
    """
    return {
      "code": self.code,
      "message": self.message,
      "severity": self.severity,
      "remediation": self.remediation,
      "timestamp": self.timestamp,
    }


class DiagnosticsRegistry:
  """
  In-memory registry storing system health, component diagnostics, and configuration warnings.
  """

  def __init__(self) -> None:
    """Initializes an empty diagnostics registry with strongly typed state models."""
    self.warnings: list[DiagnosticWarning] = []
    self.postgres_status: PostgresDiagnosticState = PostgresDiagnosticState()
    self.duckdb_status: DuckDBDiagnosticState = DuckDBDiagnosticState()
    self.data_status: DataDiagnosticState = DataDiagnosticState()
    self.template_status: TemplateDiagnosticState = TemplateDiagnosticState()
    self.llm_status: LlmDiagnosticState = LlmDiagnosticState()

  def add_warning(self, code: str, message: str, severity: str = "warning", remediation: str = "") -> None:
    """
    Records a new diagnostic warning in the registry if not already present.

    Args:
        code (str): Unique category code for the warning.
        message (str): Human-readable warning text.
        severity (str): Severity classification level.
        remediation (str): Recommended user action.
    """
    for w in self.warnings:
      if w.code == code and w.message == message:
        return
    self.warnings.append(DiagnosticWarning(code=code, message=message, severity=severity, remediation=remediation))

  def clear(self) -> None:
    """Clears all accumulated warnings and resets registry statuses."""
    self.warnings.clear()
    self.postgres_status = PostgresDiagnosticState()
    self.duckdb_status = DuckDBDiagnosticState()
    self.data_status = DataDiagnosticState()
    self.template_status = TemplateDiagnosticState()
    self.llm_status = LlmDiagnosticState()

  def get_summary(self) -> JsonObject:
    """
    Constructs a comprehensive system health summary dictionary.

    Returns:
        JsonObject: Consolidated snapshot of all component diagnostics.
    """
    overall = "healthy"
    if self.postgres_status.status == "error" or self.duckdb_status.status == "error":
      overall = "critical"
    elif self.warnings:
      overall = "degraded"

    return {
      "status": overall,
      "overall_status": overall,
      "timestamp": datetime.now(timezone.utc).isoformat(),
      "postgres": {
        "status": self.postgres_status.status,
        "latency_ms": self.postgres_status.latency_ms,
        "details": self.postgres_status.details,
        "error": self.postgres_status.error,
      },
      "duckdb": {
        "status": self.duckdb_status.status,
        "path": self.duckdb_status.path,
        "tables": {k: v for k, v in self.duckdb_status.tables.items()},
        "total_tables": self.duckdb_status.total_tables,
        "error": self.duckdb_status.error,
      },
      "data": {
        "status": self.data_status.status,
        "table_count": self.data_status.table_count,
        "tables": list(self.data_status.tables),
        "has_default_data": self.data_status.has_default_data,
        "fallback_generated": self.data_status.fallback_generated,
        "missing_files": list(self.data_status.missing_files),
        "row_counts": {k: v for k, v in self.data_status.row_counts.items()},
      },
      "datasets": {
        "status": self.data_status.status,
        "table_count": self.data_status.table_count,
        "tables": list(self.data_status.tables),
        "has_default_data": self.data_status.has_default_data,
        "fallback_generated": self.data_status.fallback_generated,
        "missing_files": list(self.data_status.missing_files),
        "row_counts": {k: v for k, v in self.data_status.row_counts.items()},
      },
      "templates": {
        "status": self.template_status.status,
        "template_count": self.template_status.template_count,
        "templates_loaded": self.template_status.templates_loaded,
        "has_templates": self.template_status.has_templates,
        "missing_file": self.template_status.missing_file,
      },
      "llm": {
        "providers_count": self.llm_status.providers_count,
        "mock_mode": self.llm_status.mock_mode,
        "models": list(self.llm_status.models),
      },
      "warnings": [
        {
          "code": w.code,
          "message": w.message,
          "severity": w.severity,
          "remediation": w.remediation,
          "timestamp": w.timestamp,
        }
        for w in self.warnings
      ],
    }


# Singleton registry instance
diagnostics_registry = DiagnosticsRegistry()


def format_postgres_error_banner(
  host: str,
  port: int,
  user: str,
  database: str,
  error_message: str,
) -> str:
  """
  Formats a prominent terminal error banner for PostgreSQL configuration or connection failures.

  Args:
      host (str): Database hostname or IP.
      port (int): Database listening port.
      user (str): Database username.
      database (str): Target database name.
      error_message (str): Raw exception or diagnostic failure details.

  Returns:
      str: Multi-line formatted banner with clear troubleshooting commands.
  """
  divider = "=" * 80
  lines = [
    divider,
    "🚨 PULSE QUERY STARTUP ERROR: POSTGRESQL DATABASE MISCONFIGURED OR UNREACHABLE",
    divider,
    f"Connection Target:  {host}:{port}",
    f"Database Name:      {database}",
    f"Database User:      {user}",
    f"Error Details:      {error_message}",
    "",
    "REMEDIATION CHECKLIST:",
    "  1. Ensure the PostgreSQL service is running:",
    "     docker compose up -d postgres",
    "  2. Verify environment configuration (.env):",
    "     POSTGRES_SERVER, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB",
    "  3. Test connection manually from terminal:",
    f"     pg_isready -h {host} -p {port} -U {user}",
    divider,
  ]
  return "\n".join(lines)


def format_duckdb_error_banner(db_path: str, error_message: str) -> str:
  """
  Formats a terminal error banner when DuckDB storage file cannot be opened or is locked.

  Args:
      db_path (str): Database file path.
      error_message (str): Failure details.

  Returns:
      str: Formatted error banner string.
  """
  divider = "=" * 80
  lines = [
    divider,
    "🚨 PULSE QUERY ERROR: DUCKDB STORAGE UNHEALTHY OR LOCKED",
    divider,
    f"DuckDB File Path: {db_path}",
    f"Error Details:    {error_message}",
    "",
    "REMEDIATION CHECKLIST:",
    "  1. Ensure no other process (e.g. another worker or Python shell) is holding a lock on the file.",
    "  2. Verify read/write permissions on the parent directory.",
    "  3. If database file is corrupted, backup and delete it so the system can re-ingest fresh CSVs.",
    divider,
  ]
  return "\n".join(lines)


def format_missing_data_warning_banner(filename: str, file_path: str, generated_rows: int) -> str:
  """
  Formats a terminal warning banner when default clinical datasets are missing.

  Args:
      filename (str): Name of the missing dataset file (e.g., hospital_data.csv).
      file_path (str): Expected filesystem path of the dataset.
      generated_rows (int): Number of synthetic fallback rows generated.

  Returns:
      str: Formatted warning banner string.
  """
  divider = "=" * 80
  lines = [
    divider,
    "⚠️  PULSE QUERY DATA WARNING: DEFAULT CLINICAL DATASET MISSING",
    divider,
    f"Expected File:  {filename}",
    f"Expected Path:  {file_path}",
    f"Generated:      {generated_rows} synthetic fallback records to keep queries operable.",
    "",
    "TO LOAD REAL CLINICAL DATA:",
    f"  1. Place '{filename}' into the 'pulse-query-backend/data/' directory.",
    "  2. Run data ingestion script:",
    "     python scripts/ingest.py",
    divider,
  ]
  return "\n".join(lines)


def format_missing_template_warning_banner(file_path: str) -> str:
  """
  Formats a terminal warning banner when the initial templates pack is missing.

  Args:
      file_path (str): Expected path of initial_templates.json.

  Returns:
      str: Formatted warning banner string.
  """
  divider = "=" * 80
  lines = [
    divider,
    "⚠️  PULSE QUERY WARNING: INITIAL TEMPLATES CONTENT PACK MISSING",
    divider,
    f"File not found: {file_path}",
    "The Template Gallery will start with 0 templates.",
    "",
    "REMEDIATION:",
    "  Ensure 'data/initial_templates.json' exists and contains valid template definitions.",
    divider,
  ]
  return "\n".join(lines)


def check_configuration_hygiene(settings_obj: SettingsProtocol) -> list[str]:
  """
  Validates application configuration for development defaults or missing critical keys.

  Args:
      settings_obj (SettingsProtocol): Application settings object conforming to `SettingsProtocol`.

  Returns:
      list[str]: List of identified warning messages.
  """
  warnings_found: list[str] = []

  # Check SECRET_KEY
  secret_key = settings_obj.SECRET_KEY
  if secret_key == "CHANGEME_IN_PROD_SUPER_SECRET_KEY":
    msg = "Insecure default SECRET_KEY in use ('CHANGEME_IN_PROD_SUPER_SECRET_KEY'). Change in .env for production."
    warnings_found.append(msg)
    diagnostics_registry.add_warning(
      code="INSECURE_SECRET_KEY",
      message=msg,
      severity="warning",
      remediation="Set SECRET_KEY in .env to a randomly generated secure string.",
    )
    logger.warning(f"⚠️ [CONFIG WARNING]: {msg}")

  # Check LLM configuration
  swarm = settings_obj.LLM_SWARM
  diagnostics_registry.llm_status.providers_count = len(swarm)
  diagnostics_registry.llm_status.models = [str(item.get("name", item.get("model", "unknown"))) for item in swarm]

  if not swarm:
    msg = "No cloud LLM API keys or local LLMs configured. Text-to-SQL AI queries will run in mock mode."
    warnings_found.append(msg)
    diagnostics_registry.llm_status.mock_mode = True
    diagnostics_registry.add_warning(
      code="NO_LLM_CONFIGURED",
      message=msg,
      severity="info",
      remediation="Provide OPENAI_API_KEY, GEMINI_API_KEY, or local Ollama host in .env to enable AI.",
    )
    logger.info(f"ℹ️ [CONFIG INFO]: {msg}")
  else:
    diagnostics_registry.llm_status.mock_mode = False

  return warnings_found


def check_configuration_hygiene_result(settings_obj: SettingsProtocol) -> AppResult[list[str]]:
  """
  Validates application configuration and returns an explicit `AppResult[list[str]]`.

  Args:
      settings_obj (SettingsProtocol): Application settings object conforming to `SettingsProtocol`.

  Returns:
      AppResult[list[str]]: `Ok(warnings)` if `SECRET_KEY` is non-empty, or `Err(AppError)` with `CONFIGURATION_ERROR`.
  """
  secret_key = str(settings_obj.SECRET_KEY or "").strip()
  if not secret_key:
    return Err(
      AppError(
        code=ErrorCode.CONFIGURATION_ERROR,
        message="SECRET_KEY must not be empty.",
        status_code=500,
      )
    )
  return Ok(check_configuration_hygiene(settings_obj))
