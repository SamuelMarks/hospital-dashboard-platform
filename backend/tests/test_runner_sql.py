"""
Tests for the SQL Runner Service.
Verifies query execution, row-to-dict conversion, and specifically
Safety/Security enforcement logic.
"""

import pytest
from unittest.mock import MagicMock
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


def test_run_sql_widget_blocks_drop() -> None:
  """
  Test that 'DROP TABLE' queries are rejected by static analysis.
  """
  mock_cursor = MagicMock()
  config = {"query": "DROP TABLE critical_data;"}

  result = run_sql_widget(mock_cursor, config)

  # Should not execute
  mock_cursor.execute.assert_not_called()

  assert result["data"] == []
  assert "Prohibited command" in result["error"]


def test_run_sql_widget_blocks_delete() -> None:
  """
  Test that 'DELETE FROM' queries are rejected.
  """
  mock_cursor = MagicMock()
  config = {"query": "DELETE FROM users WHERE 1=1"}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_not_called()
  assert "Prohibited command" in result["error"]


def test_run_sql_widget_blocks_update() -> None:
  """
  Test that 'UPDATE' queries are rejected.
  """
  mock_cursor = MagicMock()
  config = {"query": "UPDATE stats SET val = 0"}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_not_called()
  assert "Prohibited command" in result["error"]


def test_run_sql_widget_allows_complex_selects() -> None:
  """
  Test that complex SELECT queries (CTEs, Joins) are allowed.
  Ensure 'WITH' or 'JOIN' doesn't trigger false positives.
  """
  mock_cursor = MagicMock()
  mock_cursor.description = [("cnt", "int")]
  mock_cursor.fetchall.return_value = [(10,)]

  # A query with 'WITH' and 'SELECT'
  valid_query = """
    WITH data AS (SELECT * FROM t)
    SELECT count(*) as cnt FROM data
    """
  config = {"query": valid_query}

  result = run_sql_widget(mock_cursor, config)

  # Note: run_sql_widget strips whitespace, so we verify with the stripped version
  mock_cursor.execute.assert_called_with(valid_query.strip())
  assert result["error"] is None


def test_run_sql_widget_case_insensitive_blocking() -> None:
  """
  Test that 'drOp' or 'InSeRt' are caught regardless of casing.
  """
  mock_cursor = MagicMock()
  config = {"query": "drOp TABLE users"}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_not_called()
  assert "Prohibited command" in result["error"]


def test_run_sql_widget_allows_benign_keywords_in_strings() -> None:
  """
  Edge Case: If a user searches for a string containing 'update',
  it technically might trigger the regex if not careful.
  Our Regex `\bUPDATE\b` looks for word boundaries.
  """
  mock_cursor = MagicMock()
  mock_cursor.description = [("txt", "string")]
  mock_cursor.fetchall.return_value = []

  # "updated_at" contains "update" but no word boundary at end
  valid_query = "SELECT updated_at FROM posts"
  config = {"query": valid_query}

  result = run_sql_widget(mock_cursor, config)

  mock_cursor.execute.assert_called()
  assert result["error"] is None


def test_run_sql_widget_execution_error() -> None:
  """
  Test that runtime errors during SQL execution are caught and returned formatted.
  This ensures the 'except Exception' block in execution is covered.
  """
  mock_cursor = MagicMock()
  mock_cursor.execute.side_effect = Exception("Database Locked")

  config = {"query": "SELECT * FROM locked_table"}

  result = run_sql_widget(mock_cursor, config)

  assert result["error"] is not None
  assert "SQL Execution Error" in result["error"]
  assert "Database Locked" in result["error"]
