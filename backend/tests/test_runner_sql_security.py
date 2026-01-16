"""
Tests for SQL Runner Security (Relaxed Mode).

Verifies that the runner PERMITS complex queries to be passed to the database,
relying on the Database Engine's read-only settings for actual protection.
"""

import pytest
from app.services.runners.sql import validate_query_ast, SQLSecurityError

# --- Validator Unit Tests (Permissive) ---


def test_ast_allows_simple_select():
  """Verify standard SELECT is allowed."""
  validate_query_ast("SELECT * FROM users")


def test_ast_allows_complex_cte():
  """Verify Common Table Expressions passages."""
  query = """ 
    WITH regional_sales AS ( 
        SELECT region, SUM(amount) as total FROM orders
    ) 
    SELECT * FROM regional_sales WHERE total > 100
    """
  validate_query_ast(query)


def test_ast_allows_drop_passthrough():
  """
  Verify DROP TABLE is NOT blocked by the runner's AST check.
  It should reach the database (where it will fail if RO).
  """
  try:
    validate_query_ast("DROP TABLE critical_data")
  except SQLSecurityError:
    pytest.fail("Runner should not block DROP statements in relaxed mode")


def test_ast_allows_data_modification_passthrough():
  """
  Verify UPDATE/DELETE are passed through.
  """
  try:
    validate_query_ast("DELETE FROM users")
    validate_query_ast("UPDATE config SET val = 1")
  except SQLSecurityError:
    pytest.fail("Runner should not block DML statements in relaxed mode")


def test_ast_allows_pragma_passthrough():
  """
  Verify DuckDB-specific commands like PRAGMA are passed through.
  """
  validate_query_ast("PRAGMA show_tables")


def test_ast_allows_chained_statements():
  """Verify chained commands are passed through."""
  query = "SELECT * FROM users; SELECT 1;"
  validate_query_ast(query)


def test_ast_empty_query_check():
  """Verify empty strings still raise basic errors."""
  with pytest.raises(SQLSecurityError):
    validate_query_ast("")
