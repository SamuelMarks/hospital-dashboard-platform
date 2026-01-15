"""
Tests for DuckDB Manager.

Verifies:
1. Connection creation.
2. Read-Only enforcement at the database level.
"""

import os
import pytest
import duckdb
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
