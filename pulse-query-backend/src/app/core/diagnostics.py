"""
Diagnostics and Health Monitoring Module.

Provides utilities to validate backend settings, verify database connectivity,
detect missing initial datasets or templates, generate human-friendly startup
diagnostic banners, and maintain an in-memory health registry.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Any

logger = logging.getLogger("diagnostics")


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
    """Initializes an empty diagnostics registry."""
    self.warnings: list[DiagnosticWarning] = []
    self.postgres_status: dict[str, Any] = {
      "status": "unknown",
      "latency_ms": None,
      "details": None,
      "error": None,
    }
    self.duckdb_status: dict[str, Any] = {
      "status": "unknown",
      "path": None,
      "tables": {},
      "total_tables": 0,
      "error": None,
    }
    self.data_status: dict[str, Any] = {
      "has_default_data": False,
      "fallback_generated": False,
      "missing_files": [],
      "row_counts": {},
    }
    self.template_status: dict[str, Any] = {
      "templates_loaded": 0,
      "has_templates": False,
      "missing_file": False,
    }
    self.llm_status: dict[str, Any] = {
      "providers_count": 0,
      "mock_mode": True,
      "models": [],
    }

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
    self.postgres_status = {"status": "unknown", "latency_ms": None, "details": None, "error": None}
    self.duckdb_status = {"status": "unknown", "path": None, "tables": {}, "total_tables": 0, "error": None}
    self.data_status = {"has_default_data": False, "fallback_generated": False, "missing_files": [], "row_counts": {}}
    self.template_status = {"templates_loaded": 0, "has_templates": False, "missing_file": False}
    self.llm_status = {"providers_count": 0, "mock_mode": True, "models": []}

  def get_summary(self) -> dict[str, Any]:
    """
    Constructs a comprehensive system health summary dictionary.

    Returns:
        dict[str, Any]: Consolidated snapshot of all component diagnostics.
    """
    overall = "healthy"
    if self.postgres_status.get("status") == "error" or self.duckdb_status.get("status") == "error":
      overall = "critical"
    elif self.warnings:
      overall = "degraded"

    return {
      "overall_status": overall,
      "timestamp": datetime.now(timezone.utc).isoformat(),
      "postgres": self.postgres_status,
      "duckdb": self.duckdb_status,
      "data": self.data_status,
      "templates": self.template_status,
      "llm": self.llm_status,
      "warnings": [w.to_dict() for w in self.warnings],
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


def check_configuration_hygiene(settings_obj: Any) -> list[str]:
  """
  Validates application configuration for development defaults or missing critical keys.

  Args:
      settings_obj (Any): Application settings object.

  Returns:
      list[str]: List of identified warning messages.
  """
  warnings_found: list[str] = []

  # Check SECRET_KEY
  secret_key = getattr(settings_obj, "SECRET_KEY", "")
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
  swarm = getattr(settings_obj, "LLM_SWARM", [])
  diagnostics_registry.llm_status["providers_count"] = len(swarm)
  diagnostics_registry.llm_status["models"] = [item.get("name", item.get("model", "unknown")) for item in swarm]

  if not swarm:
    msg = "No cloud LLM API keys or local LLMs configured. Text-to-SQL AI queries will run in mock mode."
    warnings_found.append(msg)
    diagnostics_registry.llm_status["mock_mode"] = True
    diagnostics_registry.add_warning(
      code="NO_LLM_CONFIGURED",
      message=msg,
      severity="info",
      remediation="Provide OPENAI_API_KEY, GEMINI_API_KEY, or local Ollama host in .env to enable AI.",
    )
    logger.info(f"ℹ️ [CONFIG INFO]: {msg}")
  else:
    diagnostics_registry.llm_status["mock_mode"] = False

  return warnings_found
