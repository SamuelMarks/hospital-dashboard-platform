"""
Tests for DuckDB Manager.

Verifies:
1. Connection creation.
2. Read-Only enforcement at the database level.
"""

from collections.abc import Generator
import os
from pathlib import Path
from unittest.mock import MagicMock

import duckdb
import pytest

from app.database.duckdb import DuckDBManager

# Use a temporary file for testing write locks
TEST_DB_PATH = "test_safety.duckdb"


@pytest.fixture(scope="module")
def db_manager() -> Generator[DuckDBManager, None, None]:
  """Create a manager and seed a table."""
  manager = DuckDBManager(TEST_DB_PATH)

  # Seed initial data with Write Access
  conn = manager.get_connection()
  conn.execute("CREATE TABLE IF NOT EXISTS protective_test (id INTEGER, name VARCHAR)")
  conn.execute("INSERT INTO protective_test VALUES (1, 'Safe'), (2, 'Guard')")
  conn.close()

  yield manager

  # Cleanup
  if os.path.exists(TEST_DB_PATH):
    os.remove(TEST_DB_PATH)


def test_manager_get_readonly_connection(db_manager: DuckDBManager) -> None:
  """
  Test that the readonly connection creates a real DuckDB connection.
  """
  conn = db_manager.get_readonly_connection()
  assert isinstance(conn, duckdb.DuckDBPyConnection)
  conn.close()


def test_cleanup_and_isolation(db_manager: DuckDBManager) -> None:
  """
  Ensure reading works fine.
  """
  conn = db_manager.get_readonly_connection()
  res = conn.execute("SELECT count(*) FROM protective_test").fetchone()
  assert res is not None
  assert res[0] == 2
  conn.close()


def test_write_operation_on_readonly_connection_fails(db_manager: DuckDBManager) -> None:
  """
  Verify that an INSERT statement fails when using the read-only connection,
  raising a DuckDB-specific error (usually Catalog Error or Access Error).
  """
  conn = db_manager.get_readonly_connection()

  with pytest.raises(Exception, match=r"(?i)(read-only|cannot modify)") as excinfo:
    conn.execute("INSERT INTO protective_test VALUES (3, 'Hacker')")

  # DuckDB error message for read-only write attempts usually contains "read-only mode"
  # or "cannot modify".
  error_str = str(excinfo.value).lower()
  assert "read-only" in error_str or "cannot modify" in error_str

  conn.close()


def test_readonly_connection_retries_on_lock(monkeypatch: pytest.MonkeyPatch) -> None:
  """Test that transient lock error triggers retry and succeeds on subsequent attempt."""
  manager = DuckDBManager("dummy.duckdb")
  attempts = 0

  def _fake_connect(
    database: str = ":memory:",
    read_only: bool = False,
    config: dict[str, str] | None = None,
  ) -> MagicMock:
    """
    Simulates transient lock on first connect attempt and returns `fake_conn` on retry.

    Args:
        database (str): Database file path or `:memory:`.
        read_only (bool): Read-only flag.
        config (dict[str, str] | None): DuckDB connection configuration dict.

    Returns:
        MagicMock: Mock DuckDB connection.
    """
    _ = (database, read_only, config)
    nonlocal attempts
    attempts += 1
    if attempts == 1:
      raise duckdb.IOException("Could not set lock on file")
    return fake_conn

  fake_conn = MagicMock(spec=duckdb.DuckDBPyConnection)
  monkeypatch.setattr(duckdb, "connect", _fake_connect)
  conn = manager.get_readonly_connection(max_retries=3)
  assert conn is fake_conn
  assert attempts == 2


def test_readonly_connection_exhausts_retries_on_persistent_lock(monkeypatch: pytest.MonkeyPatch) -> None:
  """Test that persistent lock error eventually raises IOException."""
  manager = DuckDBManager("dummy.duckdb")
  monkeypatch.setattr(
    duckdb,
    "connect",
    lambda *_args, **_kwargs: (_ for _ in ()).throw(duckdb.IOException("Could not set lock on file")),
  )

  with pytest.raises(duckdb.IOException) as exc:
    manager.get_readonly_connection(max_retries=2)

  assert "lock" in str(exc.value).lower()


def test_readonly_connection_zero_retries() -> None:
  """Test that zero retries immediately raises IOException."""
  manager = DuckDBManager("dummy.duckdb")
  with pytest.raises(duckdb.IOException) as exc:
    manager.get_readonly_connection(max_retries=0)

  assert "retries" in str(exc.value).lower()


def test_connection_result_wrappers(db_manager: DuckDBManager) -> None:
  """Verify `get_connection_result` and `get_readonly_connection_result` Ok and Err branches."""
  from app.core.result import Err, Ok

  rw_ok = db_manager.get_connection_result()
  assert isinstance(rw_ok, Ok)
  rw_ok.value.close()

  ro_ok = db_manager.get_readonly_connection_result()
  assert isinstance(ro_ok, Ok)
  ro_ok.value.close()

  rw_err = db_manager.get_connection_result(max_retries=0)
  assert isinstance(rw_err, Err)

  ro_err = db_manager.get_readonly_connection_result(max_retries=0)
  assert isinstance(ro_err, Err)


@pytest.mark.asyncio
async def test_duckdb_udf_available_across_multiple_readonly_connections_and_threads(tmp_path: Path) -> None:
  """Verifies `OPTIMIZE_SERVICE_UNIT_BEDS` UDF is registered on every read-only connection and works concurrently."""
  import asyncio
  import json
  from app.database.duckdb import run_in_duckdb_thread

  db_file = str(tmp_path / "concurrent_udf.duckdb")
  manager = DuckDBManager(db_file)
  rw_conn = manager.get_connection()
  rw_conn.execute("CREATE TABLE t (x INT); INSERT INTO t VALUES (1);")
  rw_conn.close()

  from app.schemas.json_types import JsonObject

  def _query_udf() -> list[JsonObject]:
    """Opens a read-only connection, invokes `OPTIMIZE_SERVICE_UNIT_BEDS`, and returns parsed JSON rows."""
    ro_conn = manager.get_readonly_connection()
    try:
      row = ro_conn.execute("SELECT OPTIMIZE_SERVICE_UNIT_BEDS('stanford_childrens', '[]')").fetchone()
      assert row is not None
      parsed: list[JsonObject] = json.loads(str(row[0]))
      return parsed
    finally:
      ro_conn.close()

  results = await asyncio.gather(
    run_in_duckdb_thread(_query_udf),
    run_in_duckdb_thread(_query_udf),
  )
  assert len(results) == 2
  assert len(results[0]) > 0
  assert len(results[1]) > 0


def test_pooled_readonly_connection_lifecycle_and_overflow(tmp_path: Path) -> None:
  """Verifies `PooledReadOnlyDuckDBConnectionProxy`, pool checkout/return, capacity overflow, and pool draining."""
  from app.database.duckdb import PooledReadOnlyDuckDBConnectionProxy

  # 1. File-backed pool with pool_size=1
  db_file = str(tmp_path / "pooled_ro.duckdb")
  mgr = DuckDBManager(db_file, pool_size=1)
  rw = mgr.get_connection()
  rw.execute("CREATE TABLE items (v INT); INSERT INTO items VALUES (42);")
  rw.close()

  pooled1 = mgr.get_pooled_readonly_connection()
  assert isinstance(pooled1, PooledReadOnlyDuckDBConnectionProxy)
  assert pooled1.inner is not None
  cur = pooled1.cursor()
  assert cur.execute("SELECT v FROM items").fetchone() == (42,)
  assert pooled1.execute("SELECT v FROM items").fetchone() == (42,)

  # Acquire a second pooled connection while first is checked out
  pooled2 = mgr.get_pooled_readonly_connection()
  assert isinstance(pooled2, PooledReadOnlyDuckDBConnectionProxy)

  # Return first connection -> goes into pool (size=1)
  pooled1.close()
  # Second close on pooled1 is idempotent no-op
  pooled1.close()
  # Return second connection -> pool is full (maxsize=1), so it closes immediately
  pooled2.close()

  # Next checkout reuses the pooled connection from _readonly_pool
  reused = mgr.get_pooled_readonly_connection()
  assert isinstance(reused, PooledReadOnlyDuckDBConnectionProxy)
  assert reused.inner is pooled1.inner
  reused.close()

  # Opening a write connection drains the read-only pool first
  closed_cnt = mgr.close_readonly_pool()
  assert closed_cnt == 1
  assert mgr.close_readonly_pool() == 0

  # 2. In-memory pooled connection and pool_size=0 (disabled pool)
  mem_mgr = DuckDBManager(":memory:", pool_size=1)
  mem_pooled = mem_mgr.get_pooled_readonly_connection()
  assert isinstance(mem_pooled, PooledReadOnlyDuckDBConnectionProxy)
  mem_pooled.close()
  mem_mgr.close_readonly_pool()

  no_pool_mgr = DuckDBManager(":memory:", pool_size=0)
  unpooled = no_pool_mgr.get_pooled_readonly_connection()
  assert not isinstance(unpooled, PooledReadOnlyDuckDBConnectionProxy)
  no_pool_mgr._release_readonly_connection(unpooled)
