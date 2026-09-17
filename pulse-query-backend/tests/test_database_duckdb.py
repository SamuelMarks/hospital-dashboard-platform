"""
Tests for DuckDB Manager.

Verifies:
1. Connection creation.
2. Read-Only enforcement at the database level.
"""

import os

import duckdb
import pytest

from app.database.duckdb import DuckDBManager

# Use a temporary file for testing write locks
TEST_DB_PATH = "test_safety.duckdb"


@pytest.fixture(scope="module")
def db_manager():
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


def test_manager_get_readonly_connection(db_manager):
  """
  Test that the readonly connection creates a real DuckDB connection.
  """
  conn = db_manager.get_readonly_connection()
  assert isinstance(conn, duckdb.DuckDBPyConnection)
  conn.close()


def test_cleanup_and_isolation(db_manager):
  """
  Ensure reading works fine.
  """
  conn = db_manager.get_readonly_connection()
  res = conn.execute("SELECT count(*) FROM protective_test").fetchone()
  assert res[0] == 2
  conn.close()


def test_write_operation_on_readonly_connection_fails(db_manager):
  """
  Verify that an INSERT statement fails when using the read-only connection,
  raising a DuckDB-specific error (usually Catalog Error or Access Error).
  """
  conn = db_manager.get_readonly_connection()

  with pytest.raises(Exception) as excinfo:
    conn.execute("INSERT INTO protective_test VALUES (3, 'Hacker')")

  # DuckDB error message for read-only write attempts usually contains "read-only mode"
  # or "cannot modify".
  error_str = str(excinfo.value).lower()
  assert "read-only" in error_str or "cannot modify" in error_str

  conn.close()


def test_readonly_connection_retries_on_lock(monkeypatch) -> None:
  """Test that transient lock error triggers retry and succeeds on subsequent attempt."""
  manager = DuckDBManager("dummy.duckdb")
  attempts = 0

  def _fake_connect(*args, **kwargs):
    nonlocal attempts
    attempts += 1
    if attempts == 1:
      raise duckdb.IOException("Could not set lock on file")
    return "fake_conn"

  monkeypatch.setattr(duckdb, "connect", _fake_connect)
  conn = manager.get_readonly_connection(max_retries=3)
  assert conn == "fake_conn"
  assert attempts == 2


def test_readonly_connection_exhausts_retries_on_persistent_lock(monkeypatch) -> None:
  """Test that persistent lock error eventually raises IOException."""
  manager = DuckDBManager("dummy.duckdb")
  monkeypatch.setattr(
    duckdb,
    "connect",
    lambda *args, **kwargs: (_ for _ in ()).throw(duckdb.IOException("Could not set lock on file")),
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
