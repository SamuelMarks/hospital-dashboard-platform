"""
Tests for DuckDB manager error paths and dependency helper.
"""

from unittest.mock import MagicMock
import pytest
import duckdb

from app.database.duckdb import DuckDBManager, get_olap_db, duckdb_manager


def test_duckdb_manager_connection_errors(monkeypatch) -> None:
  """Ensure connection errors are surfaced for both read-write and read-only paths."""

  def _raise(*args, **kwargs):
    raise RuntimeError("boom")

  monkeypatch.setattr(duckdb, "connect", _raise)

  manager = DuckDBManager("missing.duckdb")

  with pytest.raises(RuntimeError):
    manager.get_connection()

  with pytest.raises(RuntimeError):
    manager.get_readonly_connection()


def test_get_olap_db_yields_and_closes(monkeypatch) -> None:
  """Validate the dependency yields a connection and closes it."""
  mock_conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: mock_conn)

  gen = get_olap_db()
  conn = next(gen)
  assert conn is mock_conn

  gen.close()
  mock_conn.close.assert_called_once()
