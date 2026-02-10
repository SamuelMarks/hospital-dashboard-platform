"""
Tests for DuckDB initialization error paths.
"""

import duckdb
from unittest.mock import MagicMock

from app.database import duckdb_init
from app.database.duckdb_init import create_hospital_macros, init_duckdb_on_startup
from app.database.duckdb import duckdb_manager


class _ConnWithUdfConflict:
  def execute(self, _query: str):
    return None

  def create_function(self, *_args, **_kwargs):
    raise duckdb.InvalidInputException("already exists")


class _ConnWithExecuteFailure:
  def execute(self, _query: str):
    raise RuntimeError("boom")

  def create_function(self, *_args, **_kwargs):
    return None


def test_create_hospital_macros_handles_existing_udf() -> None:
  """UDF registration conflicts should be ignored safely."""
  create_hospital_macros(_ConnWithUdfConflict())


def test_create_hospital_macros_handles_execute_errors() -> None:
  """Unexpected macro registration errors should be caught."""
  create_hospital_macros(_ConnWithExecuteFailure())


def test_init_duckdb_on_startup_closes_connection(monkeypatch) -> None:
  """Startup initialization should always close its connection."""
  conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: conn)
  monkeypatch.setattr(duckdb_init, "create_hospital_macros", lambda _conn: None)

  init_duckdb_on_startup()

  conn.close.assert_called_once()
