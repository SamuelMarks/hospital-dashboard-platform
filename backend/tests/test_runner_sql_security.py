"""
Tests for SQL Runner Security.

Verifies that the `sqlglot` based validation logic correctly identifies
and blocks destructive queries while permitting complex read-only operations.
"""

import pytest
from unittest.mock import MagicMock
from app.services.runners.sql import run_sql_widget, validate_query_ast, SQLSecurityError

# --- Validator Unit Tests ---


def test_ast_allows_simple_select():
  """Verify standard SELECT is allowed."""
  validate_query_ast("SELECT * FROM users")


def test_ast_allows_agg_and_group():
  """Verify aggregation queries pass."""
  validate_query_ast("SELECT dept, COUNT(*) FROM visits GROUP BY dept")


def test_ast_allows_cte():
  """Verify Common Table Expressions (WITH clauses) pass."""
  query = """
    WITH regional_sales AS (
        SELECT region, SUM(amount) as total FROM orders
    )
    SELECT * FROM regional_sales WHERE total > 100
    """
  validate_query_ast(query)


def test_ast_blocks_drop_table():
  """Verify DROP TABLE is rejected."""
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast("DROP TABLE critical_data")
  assert "Prohibited command" in str(exc.value)
  assert "DROP" in str(exc.value)


def test_ast_blocks_delete_from():
  """Verify DELETE is rejected."""
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast("DELETE FROM users WHERE id > 0")
  assert "DELETE" in str(exc.value)


def test_ast_blocks_update():
  """Verify UPDATE is rejected."""
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast("UPDATE config SET allow_root = true")
  assert "UPDATE" in str(exc.value)


def test_ast_blocks_semicolon_chaining():
  """Verify injection of a second destructive command via semicolon is blocked."""
  query = "SELECT * FROM users; DROP TABLE logs;"
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast(query)
  # It might fail on either "Prohibited command detected: DROP" or other error
  assert "Prohibited command" in str(exc.value)


def test_ast_blocks_create_as_select():
  """
  Verify 'CREATE TABLE x AS SELECT...' is blocked.
  This creates persistent objects, which we want to avoid in widget runners.
  """
  query = "CREATE TABLE stolen_data AS SELECT * FROM users"
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast(query)
  assert "CREATE" in str(exc.value)


def test_ast_allows_benign_keywords_in_literals():
  """
  Verify that destructive words INSIDE strings are allowed.
  Previous Regex approach often failed here.
  """
  # "DROP" is just a string value here.
  query = "SELECT * FROM messages WHERE body LIKE '%DROP TABLE%'"
  validate_query_ast(query)


def test_ast_blocks_nested_subquery_injection():
  """
  Verify that destructive commands cannot hide inside subqueries/CTEs.
  """
  query = "SELECT * FROM (DELETE FROM users RETURNING id)"

  # We expect Parse Error or Prohibited Command
  try:
    validate_query_ast(query)
    pytest.fail("Should have blocked DELETE inside subquery")
  except SQLSecurityError as e:
    assert "DELETE" in str(e) or "Syntax" in str(e)


def test_ast_syntax_error():
  """Verify that invalid SQL syntax raises a SQLSecurityError."""
  query = "SELECT * FROM"  # Incomplete
  with pytest.raises(SQLSecurityError) as exc:
    validate_query_ast(query)
  assert "Syntax Error" in str(exc.value)


# --- Integration Tests (Runner Config) ---


def test_run_sql_widget_integration_success():
  """Test full runner flow with valid query."""
  mock_cursor = MagicMock()
  mock_cursor.description = [("col", "str")]
  mock_cursor.fetchall.return_value = [("val",)]

  res = run_sql_widget(mock_cursor, {"query": "SELECT 'ok' as col"})

  assert res["error"] is None
  assert res["data"][0]["col"] == "val"


def test_run_sql_widget_integration_block():
  """Test full runner flow blocks attack."""
  mock_cursor = MagicMock()

  res = run_sql_widget(mock_cursor, {"query": "DROP TABLE users"})

  assert res["error"] is not None
  # Updated assertion to match new behavior ("Prohibited command detected")
  assert "Prohibited command" in res["error"] or "Security Violation" in res["error"]
  mock_cursor.execute.assert_not_called()
