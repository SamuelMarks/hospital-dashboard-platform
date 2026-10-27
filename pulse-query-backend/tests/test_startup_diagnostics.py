"""
Unit tests for backend startup diagnostics and configuration hygiene.
"""

import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import duckdb
import pytest

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
  assert reg.postgres_status.to_dict()["status"] == "unknown"
  assert reg.duckdb_status.to_dict()["status"] == "unknown"
  assert reg.data_status.to_dict()["status"] == "empty"
  assert reg.template_status.to_dict()["status"] == "empty"
  assert reg.llm_status.to_dict()["mock_mode"] is True

  reg.add_warning("W1", "Warning 1")
  reg.add_warning("W1", "Warning 1")
  assert len(reg.warnings) == 1
  assert reg.get_summary()["overall_status"] == "degraded"

  reg.postgres_status.status = "error"
  assert reg.get_summary()["overall_status"] == "critical"

  reg.clear()
  assert len(reg.warnings) == 0
  assert reg.postgres_status.status == "unknown"


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
  """`check_configuration_hygiene` should flag insecure keys and missing LLM providers."""

  class _InsecureNoSwarm:
    """Stub settings object with default insecure `SECRET_KEY` and empty `LLM_SWARM`."""

    SECRET_KEY = "CHANGEME_IN_PROD_SUPER_SECRET_KEY"
    LLM_SWARM: list[dict[str, str]] = []

  warnings = check_configuration_hygiene(_InsecureNoSwarm())
  assert any("Insecure default SECRET_KEY" in w for w in warnings)
  assert any("No cloud LLM API keys" in w for w in warnings)
  assert diagnostics_registry.llm_status.mock_mode is True

  class _CustomSettings:
    """Stub settings object with custom production `SECRET_KEY` and populated `LLM_SWARM`."""

    SECRET_KEY = "a-very-secure-custom-key-for-production"
    LLM_SWARM = [{"provider": "openai", "name": "GPT-4o", "model": "gpt-4o"}]

  warnings_secure = check_configuration_hygiene(_CustomSettings())
  assert not warnings_secure
  assert diagnostics_registry.llm_status.mock_mode is False


@pytest.mark.asyncio
async def test_validate_postgres_connection_success(monkeypatch: pytest.MonkeyPatch) -> None:
  """`validate_postgres_connection` should record connected status on valid query."""
  from tests.typed_test_doubles import ExcTb, ExcType, ExcVal, TypedAsyncContextManager

  dummy_conn = AsyncMock()
  dummy_conn.execute = AsyncMock()

  dummy_engine = MagicMock()
  dummy_engine.connect.return_value = TypedAsyncContextManager(dummy_conn)

  import app.database.postgres as pg_mod

  monkeypatch.setattr(pg_mod, "engine", dummy_engine)

  res = await validate_postgres_connection(raise_on_error=False)
  assert res["status"] == "connected"
  assert res["error"] is None
  _ = (ExcType, ExcVal, ExcTb)


@pytest.mark.asyncio
async def test_validate_postgres_connection_failure(monkeypatch: pytest.MonkeyPatch) -> None:
  """`validate_postgres_connection` should catch errors and raise when configured."""
  from tests.typed_test_doubles import ExcTb, ExcType, ExcVal

  class _FailingContext:
    """Stub async context manager that raises `ConnectionRefusedError` on enter."""

    async def __aenter__(self) -> None:
      """
      Raises `ConnectionRefusedError`.

      Raises:
          ConnectionRefusedError: Always raised.
      """
      raise ConnectionRefusedError("Connection refused by host")

    async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> bool:
      """
      Exits context without suppressing exceptions.

      Args:
          exc_type (ExcType): Exception type if raised.
          exc (ExcVal): Exception instance if raised.
          tb (ExcTb): Traceback if raised.

      Returns:
          bool: Always False.
      """
      _ = (exc_type, exc, tb)
      return False

  dummy_engine = MagicMock()
  dummy_engine.connect.return_value = _FailingContext()

  import app.database.postgres as pg_mod

  monkeypatch.setattr(pg_mod, "engine", dummy_engine)

  res = await validate_postgres_connection(raise_on_error=False)
  assert res["status"] == "error"
  assert "Connection refused" in str(res["error"])

  with pytest.raises(DatabaseConfigurationError):
    await validate_postgres_connection(raise_on_error=True)


def test_validate_duckdb_storage_memory_success() -> None:
  """`validate_duckdb_storage` should inspect tables in memory database."""
  mgr = DuckDBManager(":memory:")
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert res["total_tables"] == 0


def test_validate_duckdb_storage_with_tables(tmp_path: Path) -> None:
  """`validate_duckdb_storage` should report tables and row counts."""
  db_file = str(tmp_path / "test_diag.duckdb")
  mgr = DuckDBManager(db_file)
  conn = mgr.get_connection()
  conn.execute("CREATE TABLE sample (id INT); INSERT INTO sample VALUES (1), (2);")
  conn.close()

  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert "sample" in res["tables"]
  assert res["tables"]["sample"] == 2


def test_validate_duckdb_storage_parent_dir_creation_failure(monkeypatch: pytest.MonkeyPatch) -> None:
  """`validate_duckdb_storage` should report error when directory creation fails."""
  mgr = DuckDBManager("/nonexistent_forbidden_dir_12345/data.duckdb")

  def _failing_makedirs(_path: str | Path, exist_ok: bool = False) -> None:
    """
    Simulates a `PermissionError` when creating parent directories.

    Args:
        _path (str | Path): Target directory path.
        exist_ok (bool): Exist-ok flag.

    Raises:
        PermissionError: Always raised.
    """
    _ = exist_ok
    raise PermissionError("Access denied")

  monkeypatch.setattr(os, "makedirs", _failing_makedirs)
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "error"
  assert "Cannot create database parent directory" in str(res["error"])


def test_validate_duckdb_storage_connection_exception(monkeypatch: pytest.MonkeyPatch) -> None:
  """`validate_duckdb_storage` should catch connection or query errors."""
  mgr = DuckDBManager(":memory:")

  def _failing_get_conn() -> duckdb.DuckDBPyConnection:
    """
    Raises a simulated `duckdb.IOException`.

    Returns:
        duckdb.DuckDBPyConnection: Never returns.

    Raises:
        duckdb.IOException: Always raised.
    """
    raise duckdb.IOException("File is locked by another process")

  monkeypatch.setattr(mgr, "get_connection", _failing_get_conn)
  res = mgr.validate_duckdb_storage()
  assert res["status"] == "error"
  assert "File is locked" in str(res["error"])


def test_validate_duckdb_storage_table_count_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
  """`validate_duckdb_storage` should handle table row count query exceptions gracefully."""
  mgr = DuckDBManager(":memory:")

  class _MockConn:
    """Stub connection that succeeds on `SHOW TABLES` and fails on `SELECT COUNT(*)`."""

    def execute(self, query: str) -> MagicMock:
      """
      Returns `('flaky',)` for `SHOW TABLES` and raises `RuntimeError` for count queries.

      Args:
          query (str): SQL query string.

      Returns:
          MagicMock: Mock cursor result.

      Raises:
          RuntimeError: On count query.
      """
      if "SHOW TABLES" in query:
        mock_res = MagicMock()
        mock_res.fetchall.return_value = [("flaky",)]
        return mock_res
      raise RuntimeError("Count failed")

    def close(self) -> None:
      """No-op close hook."""

  monkeypatch.setattr(mgr, "get_connection", lambda: _MockConn())

  res = mgr.validate_duckdb_storage()
  assert res["status"] == "ready"
  assert res["tables"]["flaky"] == -1
