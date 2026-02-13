"""
Tests for the SQL Runner Service Integration.
Verifies query execution flow and error handling from the Database layer.
"""

from unittest.mock import MagicMock
from app.services.runners import sql as sql_runner
from app.services.runners.sql import run_sql_widget


def test_run_sql_widget_success() -> None:
  """
  Test a successful SQL SELECT query returning rows.
  """
  mock_cursor = MagicMock()
  mock_cursor.description = [("id", "string"), ("value", "int")]
  mock_cursor.fetchall.return_value = [("row1", 100), ("row2", 200)]

  config = {"query": "SELECT * FROM table"}

  result = run_sql_widget(mock_cursor, config)

  # Verify Output
  assert result["error"] is None
  assert len(result["data"]) == 2
  assert result["data"][0] == {"id": "row1", "value": 100}


def test_run_sql_widget_attempts_execution_on_drop() -> None:
  """
  Test that 'DROP TABLE' queries are attempted (executed) on the cursor.
  The runner does not block them; the DB is expected to throw.
  """
  mock_cursor = MagicMock()
  # We simulate the DB throwing an error because it's Read-Only
  mock_cursor.execute.side_effect = Exception("Catalog Error: Cannot drop table in read-only mode")

  config = {"query": "DROP TABLE critical_data;"}

  result = run_sql_widget(mock_cursor, config)

  # Should have attempted execution
  mock_cursor.execute.assert_called()

  # Error should come from the exception, not a pre-check
  assert "Catalog Error" in result["error"]


def test_run_sql_widget_attempts_execution_on_update() -> None:
  """
  Test that 'UPDATE' queries are attempted.
  """
  mock_cursor = MagicMock()
  mock_cursor.execute.side_effect = Exception("Access Error: Cannot modify")

  config = {"query": "UPDATE stats SET val = 0"}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_called()
  assert "Access Error" in result["error"]


def test_run_sql_widget_allows_complex_selects() -> None:
  """
  Test that complex SELECT queries (CTEs, Joins) are allowed.
  """
  mock_cursor = MagicMock()
  mock_cursor.description = [("cnt", "int")]
  mock_cursor.fetchall.return_value = [(10,)]

  valid_query = """ 
    WITH data AS (SELECT * FROM t) 
    SELECT count(*) as cnt FROM data
    """
  config = {"query": valid_query}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_called_with(valid_query.strip())
  assert result["error"] is None


def test_run_sql_widget_execution_error() -> None:
  """
  Test that runtime errors during SQL execution are caught and returned formatted.
  """
  mock_cursor = MagicMock()
  mock_cursor.execute.side_effect = Exception("Database Locked")

  config = {"query": "SELECT * FROM locked_table"}

  result = run_sql_widget(mock_cursor, config)

  assert result["error"] is not None
  assert "SQL Execution Error" in result["error"]
  assert "Database Locked" in result["error"]


def test_run_sql_widget_missing_query() -> None:
  """Ensure missing SQL returns an error payload."""
  mock_cursor = MagicMock()
  config = {}

  result = run_sql_widget(mock_cursor, config)

  assert result["error"] is not None
  assert "Missing SQL query" in result["error"]


def test_run_sql_widget_no_result_set() -> None:
  """Queries with no cursor description should return empty data without error."""
  mock_cursor = MagicMock()
  mock_cursor.description = None

  config = {"query": "SET some_setting = 1"}

  result = run_sql_widget(mock_cursor, config)

  assert result["error"] is None
  assert result["data"] == []
  assert result["columns"] == []


def test_run_sql_widget_continues_on_validation_warning(monkeypatch) -> None:
  """Validation errors should not prevent execution."""
  mock_cursor = MagicMock()
  mock_cursor.description = [("id", "int")]
  mock_cursor.fetchall.return_value = [(1,)]

  def _boom(_query: str) -> None:
    raise sql_runner.SQLSecurityError("bad")

  monkeypatch.setattr(sql_runner, "validate_query_ast", _boom)

  result = run_sql_widget(mock_cursor, {"query": "SELECT 1"})

  assert result["error"] is None


def test_run_sql_widget_respects_max_rows() -> None:
  """Max rows should use fetchmany to limit result set."""
  mock_cursor = MagicMock()
  mock_cursor.description = [("id", "int")]
  mock_cursor.fetchmany.return_value = [(1,)]

  result = run_sql_widget(mock_cursor, {"query": "SELECT 1", "max_rows": 1})

  mock_cursor.fetchmany.assert_called_once_with(1)
  assert result["data"] == [{"id": 1}]
