"""
Tests for DuckDB initialization, macro registration, and error paths.
"""

from collections.abc import Callable
from pathlib import Path
from unittest.mock import MagicMock

import duckdb
import duckdb.sqltypes as sqltypes
import pytest

from app.database import duckdb_init
from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import create_hospital_macros, init_duckdb_on_startup


class _ConnWithUdfConflict:
  """Stub DuckDB connection that raises `InvalidInputException` when registering a UDF."""

  def __init__(self) -> None:
    """Initializes tracking counters for executed queries and UDF registrations."""
    self.executed_queries: list[str] = []
    self.udf_attempts: int = 0

  def execute(self, query: str) -> None:
    """
    Records the executed SQL statement.

    Args:
        query (str): Executed SQL query string.
    """
    self.executed_queries.append(query)

  def create_function(
    self,
    name: str,
    function: Callable[..., str],
    parameters: list[sqltypes.DuckDBPyType] | None = None,
    return_type: sqltypes.DuckDBPyType | None = None,
    *,
    side_effects: bool = False,
  ) -> None:
    """
    Simulates a DuckDB UDF conflict (`already exists`).

    Args:
        name (str): UDF name.
        function (Callable[..., str]): UDF callable.
        parameters (list[sqltypes.DuckDBPyType] | None): Parameter types.
        return_type (sqltypes.DuckDBPyType | None): Return type.
        side_effects (bool): Side effects flag.

    Raises:
        duckdb.InvalidInputException: Always raised.
    """
    _ = (name, function, parameters, return_type, side_effects)
    self.udf_attempts += 1
    raise duckdb.InvalidInputException("already exists")


class _ConnWithExecuteFailure:
  """Stub DuckDB connection that raises `RuntimeError` on `execute`."""

  def __init__(self) -> None:
    """Initializes tracking counter for failed `execute` calls."""
    self.execute_calls: int = 0

  def execute(self, _query: str) -> None:
    """
    Simulates a fatal SQL execution failure.

    Args:
        _query (str): SQL query string.

    Raises:
        RuntimeError: Always raised.
    """
    self.execute_calls += 1
    raise RuntimeError("boom")

  def create_function(
    self,
    name: str,
    function: Callable[..., str],
    parameters: list[sqltypes.DuckDBPyType] | None = None,
    return_type: sqltypes.DuckDBPyType | None = None,
    *,
    side_effects: bool = False,
  ) -> None:
    """
    No-op UDF registration.

    Args:
        name (str): UDF name.
        function (Callable[..., str]): UDF callable.
        parameters (list[sqltypes.DuckDBPyType] | None): Parameter types.
        return_type (sqltypes.DuckDBPyType | None): Return type.
        side_effects (bool): Side effects flag.
    """
    _ = (name, function, parameters, return_type, side_effects)


def test_create_hospital_macros_handles_existing_udf() -> None:
  """UDF registration conflicts should be ignored safely while still registering SQL macros."""
  conn = _ConnWithUdfConflict()
  create_hospital_macros(conn)
  assert conn.udf_attempts == 1
  assert len(conn.executed_queries) >= 2
  assert any("SAFE_DIV" in q for q in conn.executed_queries)


def test_create_hospital_macros_handles_execute_errors(caplog: pytest.LogCaptureFixture) -> None:
  """Unexpected macro registration errors should be caught and logged with exception type."""
  import logging

  caplog.set_level(logging.ERROR)
  conn = _ConnWithExecuteFailure()
  create_hospital_macros(conn)
  assert conn.execute_calls == 1
  assert "Failed to register DuckDB macros (RuntimeError): boom" in caplog.text


def test_init_duckdb_on_startup_registers_macros_and_closes_connection(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """
  Verifies `init_duckdb_on_startup` registers executable clinical macros (`SAFE_DIV`, `IS_BOTTLENECK`)
  against a real DuckDB instance and guarantees connection closure even if macro setup raises.
  """
  temp_db = str(tmp_path / "startup_macros.duckdb")
  monkeypatch.setattr(duckdb_manager, "db_path", temp_db)

  init_duckdb_on_startup()

  check_conn = duckdb.connect(temp_db, read_only=True)
  try:
    div_row = check_conn.execute("SELECT SAFE_DIV(10, 2), SAFE_DIV(10, 0)").fetchone()
    assert div_row == (5.0, 0.0)
    bottleneck_row = check_conn.execute("SELECT IS_BOTTLENECK(10, 2), IS_BOTTLENECK(2, 10)").fetchone()
    assert bottleneck_row == (True, False)
  finally:
    check_conn.close()

  # Also verify finally block closes connection when create_hospital_macros raises
  mock_conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: mock_conn)
  monkeypatch.setattr(
    duckdb_init,
    "create_hospital_macros",
    lambda _conn: (_ for _ in ()).throw(RuntimeError("macro boom")),
  )
  with pytest.raises(RuntimeError, match="macro boom"):
    init_duckdb_on_startup()
  mock_conn.close.assert_called_once()
