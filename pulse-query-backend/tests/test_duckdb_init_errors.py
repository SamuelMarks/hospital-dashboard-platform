"""
Tests for DuckDB initialization error paths.
"""

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


def test_init_duckdb_on_startup_closes_connection(monkeypatch: pytest.MonkeyPatch) -> None:
  """Startup initialization should always close its connection."""
  conn = MagicMock()
  monkeypatch.setattr(duckdb_manager, "get_connection", lambda: conn)
  monkeypatch.setattr(duckdb_init, "create_hospital_macros", lambda _conn: None)

  init_duckdb_on_startup()

  conn.close.assert_called_once()
