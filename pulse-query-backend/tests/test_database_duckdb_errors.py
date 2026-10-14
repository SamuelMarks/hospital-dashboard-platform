"""
Tests for DuckDB manager error paths and dependency helper.
"""

from typing import Any

from unittest.mock import MagicMock

import duckdb
import pytest

from app.database.duckdb import (
  DuckDBManager,
  duckdb_manager,
  get_olap_db,
  get_readonly_olap_db,
  register_duckdb_udfs,
  run_in_duckdb_thread,
)


def test_duckdb_manager_connection_errors(monkeypatch: Any) -> None:
  """Ensure connection errors are surfaced for both read-write and read-only paths."""

  def _raise(*args: Any, **kwargs: Any) -> None:
    """
    Verify raise behavior.

    Args:
        args: Test parameter or fixture.
        kwargs: Test parameter or fixture.
    """
    raise RuntimeError("boom")

  monkeypatch.setattr(duckdb, "connect", _raise)

  manager = DuckDBManager("missing.duckdb")

  with pytest.raises(RuntimeError):
    manager.get_connection()

  with pytest.raises(RuntimeError):
    manager.get_readonly_connection()


def test_get_olap_db_yields_and_closes(monkeypatch: Any) -> None:
  """Validate the dependency yields a connection and closes it."""
  mock_conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: mock_conn)

  gen = get_olap_db()
  conn = next(gen)
  assert conn is mock_conn

  gen.close()
  mock_conn.close.assert_called_once()


def test_get_readonly_olap_db_yields_and_closes(monkeypatch: Any) -> None:
  """Validate the read-only dependency yields a connection and closes it."""
  mock_conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_readonly_connection", lambda: mock_conn)

  gen = get_readonly_olap_db()
  conn = next(gen)
  assert conn is mock_conn

  gen.close()
  mock_conn.close.assert_called_once()


def test_register_duckdb_udfs_handles_errors_and_non_callable() -> None:
  """Verify `register_duckdb_udfs` gracefully handles connections without `create_function` or raising errors."""
  register_duckdb_udfs(object())  # type: ignore[arg-type]

  bad_conn = MagicMock()
  bad_conn.create_function.side_effect = RuntimeError("udf conflict")
  register_duckdb_udfs(bad_conn)
  bad_conn.create_function.assert_called_once()


@pytest.mark.asyncio
async def test_run_in_duckdb_thread_executes_callable() -> None:
  """Verify `run_in_duckdb_thread` offloads a synchronous function and returns its value."""
  res = await run_in_duckdb_thread(lambda a, b: a + b, 7, 8)
  assert res == 15
