"""
Unit tests for backend startup diagnostics and configuration hygiene.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import os

import duckdb
import pytest

from app.core.config import Settings
from app.core.diagnostics import (
  DiagnosticWarning,
  DiagnosticsRegistry,
  check_configuration_hygiene,
  diagnostics_registry,
  format_duckdb_error_banner,
  format_missing_data_warning_banner,
  format_missing_template_warning_banner,
  format_postgres_error_banner,
)
from app.database.duckdb import DuckDBManager
from app.database.postgres import DatabaseConfigurationError, validate_postgres_connection
from app.services.data_ingestion import DataIngestionService
from app.services.template_seeder import TemplateSeeder


def test_diagnostic_warning_to_dict() -> None:
  """DiagnosticWarning should serialize attributes correctly to dict."""
  warn = DiagnosticWarning(
    code="TEST_CODE",
    message="A test warning",
    severity="warning",
    remediation="Fix it",
    timestamp="2026-09-06T00:00:00Z",
  )
  d = warn.to_dict()
  assert d["code"] == "TEST_CODE"
  assert d["message"] == "A test warning"
  assert d["severity"] == "warning"
  assert d["remediation"] == "Fix it"
  assert d["timestamp"] == "2026-09-06T00:00:00Z"


def test_diagnostics_registry_methods() -> None:
  """DiagnosticsRegistry should manage warnings and summarize overall health."""
  reg = DiagnosticsRegistry()
  assert reg.get_summary()["overall_status"] == "healthy"

  reg.add_warning("W1", "Warning 1")
  reg.add_warning("W1", "Warning 1")  # Deduplication check
  assert len(reg.warnings) == 1
  assert reg.get_summary()["overall_status"] == "degraded"

  reg.postgres_status["status"] = "error"
  assert reg.get_summary()["overall_status"] == "critical"

  reg.clear()
  assert len(reg.warnings) == 0
  assert reg.postgres_status["status"] == "unknown"


def test_format_error_banners() -> None:
  """Banner formatting helper functions should produce descriptive output."""
  pg_banner = format_postgres_error_banner("localhost", 5432, "postgres", "pulse_db", "Connection refused")
  assert "PULSE QUERY STARTUP ERROR" in pg_banner
  assert "localhost:5432" in pg_banner
  assert "Connection refused" in pg_banner

  duck_banner = format_duckdb_error_banner("data.duckdb", "File locked")
  assert "DUCKDB STORAGE UNHEALTHY OR LOCKED" in duck_banner
  assert "data.duckdb" in duck_banner

  data_banner = format_missing_data_warning_banner("hospital_data.csv", "/data/hospital_data.csv", 1000)
  assert "DEFAULT CLINICAL DATASET MISSING" in data_banner
  assert "1000 synthetic fallback" in data_banner

  tmpl_banner = format_missing_template_warning_banner("/data/templates.json")
  assert "INITIAL TEMPLATES CONTENT PACK MISSING" in tmpl_banner


def test_check_configuration_hygiene() -> None:
  """check_configuration_hygiene should flag insecure keys and missing LLM providers."""

  class _InsecureNoSwarm:
    SECRET_KEY = "CHANGEME_IN_PROD_SUPER_SECRET_KEY"
    LLM_SWARM = []

  warnings = check_configuration_hygiene(_InsecureNoSwarm())
  assert any("Insecure default SECRET_KEY" in w for w in warnings)
  assert any("No cloud LLM API keys" in w for w in warnings)
  assert diagnostics_registry.llm_status["mock_mode"] is True

  class _CustomSettings:
    SECRET_KEY = "a-very-secure-custom-key-for-production"
    LLM_SWARM = [{"provider": "openai", "name": "GPT-4o", "model": "gpt-4o"}]

  warnings_secure = check_configuration_hygiene(_CustomSettings())
  assert not warnings_secure
  assert diagnostics_registry.llm_status["mock_mode"] is False


@pytest.mark.asyncio
async def test_validate_postgres_connection_success(monkeypatch) -> None:
  """validate_postgres_connection should record connected status on valid query."""
  dummy_conn = AsyncMock()
  dummy_conn.execute = AsyncMock()

  class _DummyContext:
    async def __aenter__(self):
      return dummy_conn

    async def __aexit__(self, exc_type, exc, tb):
      return False

  dummy_engine = MagicMock()
  dummy_engine.connect.return_value = _DummyContext()

  import app.database.postgres as pg_mod

  monkeypatch.setattr(pg_mod, "engine", dummy_engine)

  res = await validate_postgres_connection(raise_on_error=False)
  assert res["status"] == "connected"
  assert res["error"] is None


@pytest.mark.asyncio
async def test_validate_postgres_connection_failure(monkeypatch) -> None:
  """validate_postgres_connection should catch errors and raise when configured."""

  class _FailingContext:
    async def __aenter__(self):
      raise ConnectionRefusedError("Connection refused by host")

    async def __aexit__(self, exc_type, exc, tb):
      return False

  dummy_engine = MagicMock()
  dummy_engine.connect.return_value = _FailingContext()

  import app.database.postgres as pg_mod

  monkeypatch.setattr(pg_mod, "engine", dummy_engine)

  res = await validate_postgres_connection(raise_on_error=False)
  assert res["status"] == "error"
  assert "Connection refused" in res["error"]

  with pytest.raises(DatabaseConfigurationError):
    await validate_postgres_connection(raise_on_error=True)


def test_validate_duckdb_storage_memory_success() -> None:
  """validate_duckdb_storage should inspect tables in memory database."""
  mgr = DuckDBManager(":memory:")
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert res["total_tables"] == 0


def test_validate_duckdb_storage_with_tables(tmp_path) -> None:
  """validate_duckdb_storage should report tables and row counts."""
  db_file = str(tmp_path / "test_diag.duckdb")
  mgr = DuckDBManager(db_file)
  conn = mgr.get_connection()
  conn.execute("CREATE TABLE sample (id INT); INSERT INTO sample VALUES (1), (2);")
  conn.close()

  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert "sample" in res["tables"]
  assert res["tables"]["sample"] == 2


def test_validate_duckdb_storage_parent_dir_creation_failure(monkeypatch) -> None:
  """validate_duckdb_storage should report error when directory creation fails."""
  mgr = DuckDBManager("/nonexistent_forbidden_dir_12345/data.duckdb")

  def _failing_makedirs(_path, **_kwargs):
    raise PermissionError("Access denied")

  monkeypatch.setattr(os, "makedirs", _failing_makedirs)
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "error"
  assert "Cannot create database parent directory" in res["error"]


def test_validate_duckdb_storage_connection_exception(monkeypatch) -> None:
  """validate_duckdb_storage should catch connection or query errors."""
  mgr = DuckDBManager(":memory:")

  def _failing_get_conn():
    raise duckdb.IOException("File is locked by another process")

  monkeypatch.setattr(mgr, "get_connection", _failing_get_conn)
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "error"
  assert "File is locked" in res["error"]


def test_validate_duckdb_storage_table_count_fallback(monkeypatch) -> None:
  """validate_duckdb_storage should handle table row count query exceptions gracefully."""
  mgr = DuckDBManager(":memory:")

  class _MockConn:
    def execute(self, query: str):
      if "SHOW TABLES" in query:
        mock_res = MagicMock()
        mock_res.fetchall.return_value = [("flaky",)]
        return mock_res
      raise RuntimeError("Count failed")

    def close(self) -> None:
      pass

  monkeypatch.setattr(mgr, "get_connection", lambda: _MockConn())

  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert res["tables"]["flaky"] == -1
