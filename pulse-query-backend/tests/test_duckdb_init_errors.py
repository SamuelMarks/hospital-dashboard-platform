"""
Tests for DuckDB initialization, macro registration, and error paths.
"""

from pathlib import Path
from unittest.mock import MagicMock

import duckdb
import pytest

from app.database import duckdb_init
from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import create_hospital_macros, init_duckdb_on_startup


class _ConnWithUdfConflict:
  """Stub DuckDB connection that raises `InvalidInputException` when registering a UDF."""

  def execute(self, _query: str) -> None:
    """
    No-op SQL execution.

    Args:
        _query (str): Ignored SQL query string.
    """
    return

  def create_function(self, *_args: object, **_kwargs: object) -> None:
    """
    Simulates a DuckDB UDF conflict (`already exists`).

    Args:
        *_args (object): Positional arguments.
        **_kwargs (object): Keyword arguments.

    Raises:
        duckdb.InvalidInputException: Always raised.
    """
    raise duckdb.InvalidInputException("already exists")


class _ConnWithExecuteFailure:
  """Stub DuckDB connection that raises `RuntimeError` on `execute`."""

  def execute(self, _query: str) -> None:
    """
    Simulates a fatal SQL execution failure.

    Args:
        _query (str): SQL query string.

    Raises:
        RuntimeError: Always raised.
    """
    raise RuntimeError("boom")

  def create_function(self, *_args: object, **_kwargs: object) -> None:
    """
    No-op UDF registration.

    Args:
        *_args (object): Positional arguments.
        **_kwargs (object): Keyword arguments.
    """
    return


def test_create_hospital_macros_handles_existing_udf() -> None:
  """UDF registration conflicts should be ignored safely."""
  create_hospital_macros(_ConnWithUdfConflict())


def test_create_hospital_macros_handles_execute_errors() -> None:
  """Unexpected macro registration errors should be caught."""
  create_hospital_macros(_ConnWithExecuteFailure())


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
