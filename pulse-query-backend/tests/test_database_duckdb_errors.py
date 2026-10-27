"""
Tests for DuckDB manager error paths and dependency helper.
"""

from collections.abc import Callable
from unittest.mock import MagicMock

import duckdb
import duckdb.sqltypes as sqltypes
import pytest

from app.database.duckdb import (
  DuckDBManager,
  duckdb_manager,
  get_olap_db,
  get_readonly_olap_db,
  register_duckdb_udfs,
  run_in_duckdb_thread,
)


def test_duckdb_manager_connection_errors(monkeypatch: pytest.MonkeyPatch) -> None:
  """Ensure connection errors are surfaced for both read-write and read-only paths."""

  def _raise(database: str = ":memory:", read_only: bool = False, config: dict[str, str] | None = None) -> None:
    """
    Simulates a DuckDB connection failure.

    Args:
        database (str): Target database path.
        read_only (bool): Read-only flag.
        config (dict[str, str] | None): Optional DuckDB configuration dictionary.

    Raises:
        RuntimeError: Always raised.
    """
    _ = (database, read_only, config)
    raise RuntimeError("boom")

  monkeypatch.setattr(duckdb, "connect", _raise)

  manager = DuckDBManager("missing.duckdb")

  with pytest.raises(RuntimeError):
    manager.get_connection()

  with pytest.raises(RuntimeError):
    manager.get_readonly_connection()

  with pytest.raises(duckdb.IOException):
    manager.get_connection(max_retries=0)
  with pytest.raises(duckdb.IOException):
    manager.get_readonly_connection(max_retries=0)


def test_duckdb_manager_get_connection_lock_retry(monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `get_connection` retries on transient lock IOExceptions and raises non-lock IOExceptions."""
  attempts = 0
  mock_conn = MagicMock()

  def _flaky_connect(
    database: str = ":memory:",
    read_only: bool = False,
    config: dict[str, str] | None = None,
  ) -> MagicMock:
    """Simulate a transient DuckDB file lock IOException on the first attempt."""
    _ = (database, read_only, config)
    nonlocal attempts
    attempts += 1
    if attempts < 2:
      raise duckdb.IOException("Could not set lock on file")
    return mock_conn

  monkeypatch.setattr(duckdb, "connect", _flaky_connect)
  monkeypatch.setattr("time.sleep", lambda _s: None)

  manager = DuckDBManager("locked.duckdb")
  assert manager.get_connection(max_retries=3) is mock_conn
  assert attempts == 2

  attempts = 0
  assert manager.get_readonly_connection(max_retries=3) is mock_conn
  assert attempts == 2

  from app.database.duckdb import ReadOnlyDuckDBConnectionProxy

  mem_manager = DuckDBManager(":memory:")
  ro_proxy = mem_manager.get_readonly_connection(max_retries=1)
  assert isinstance(ro_proxy, ReadOnlyDuckDBConnectionProxy)
  assert ro_proxy.inner is mock_conn

  monkeypatch.setattr(duckdb, "connect", lambda *_a, **_kw: (_ for _ in ()).throw(duckdb.IOException("Disk full")))
  with pytest.raises(duckdb.IOException, match="Disk full"):
    manager.get_connection(max_retries=3)
  with pytest.raises(duckdb.IOException, match="Disk full"):
    manager.get_readonly_connection(max_retries=3)


def test_get_olap_db_yields_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
  """Validate the dependency yields a connection and closes it."""
  mock_conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: mock_conn)

  gen = get_olap_db()
  conn = next(gen)
  assert conn is mock_conn

  gen.close()
  mock_conn.close.assert_called_once()


def test_get_readonly_olap_db_yields_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
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

  class _ConnWithoutUdf:
    """Minimal connection double implementing `DuckDBConnectionProtocol` without `create_function`."""

    def execute(self, query: str) -> MagicMock:
      """No-op query execution."""
      _ = query
      return MagicMock()

    def close(self) -> None:
      """No-op close."""

  register_duckdb_udfs(_ConnWithoutUdf())

  called = 0

  class _FailingUdfConn:
    """Connection double implementing `DuckDBUdfConnectionProtocol` that raises on `create_function`."""

    def create_function(
      self,
      name: str,
      function: Callable[..., str],
      parameters: list[sqltypes.DuckDBPyType] | None = None,
      return_type: sqltypes.DuckDBPyType | None = None,
      *,
      side_effects: bool = False,
    ) -> None:
      """Raises `RuntimeError` when called."""
      nonlocal called
      _ = (name, function, parameters, return_type, side_effects)
      called += 1
      raise RuntimeError("udf conflict")

  register_duckdb_udfs(_FailingUdfConn())
  assert called == 1


@pytest.mark.asyncio
async def test_run_in_duckdb_thread_executes_callable() -> None:
  """Verify `run_in_duckdb_thread` offloads a synchronous function and returns its value."""
  res = await run_in_duckdb_thread(lambda a, b: a + b, 7, 8)
  assert res == 15
