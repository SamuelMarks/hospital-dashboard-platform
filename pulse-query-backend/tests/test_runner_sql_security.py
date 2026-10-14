"""
Tests for SQL Runner Security (Relaxed Mode).

Verifies that the runner PERMITS complex queries to be passed to the database,
relying on the Database Engine's read-only settings for actual protection.
"""

from typing import Any

import pytest
import sqlglot

from app.services.runners.sql import SQLSecurityError, validate_query_ast

# --- Validator Unit Tests (Permissive) ---


def test_ast_allows_simple_select() -> None:
  """Verify standard SELECT is allowed."""
  validate_query_ast("SELECT * FROM users")


def test_ast_allows_complex_cte() -> None:
  """Verify Common Table Expressions passages."""
  query = """ 
    WITH regional_sales AS ( 
        SELECT region, SUM(amount) as total FROM orders
    ) 
    SELECT * FROM regional_sales WHERE total > 100
    """
  validate_query_ast(query)


def test_ast_allows_drop_passthrough() -> None:
  """
  Verify DROP TABLE is NOT blocked by the runner's AST check.
  It should reach the database (where it will fail if RO).
  """
  try:
    validate_query_ast("DROP TABLE critical_data")
  except SQLSecurityError:
    pytest.fail("Runner should not block DROP statements in relaxed mode")


def test_ast_allows_data_modification_passthrough() -> None:
  """
  Verify UPDATE/DELETE are passed through.
  """
  try:
    validate_query_ast("DELETE FROM users")
    validate_query_ast("UPDATE config SET val = 1")
  except SQLSecurityError:
    pytest.fail("Runner should not block DML statements in relaxed mode")


def test_ast_allows_pragma_passthrough() -> None:
  """
  Verify DuckDB-specific commands like PRAGMA are passed through.
  """
  validate_query_ast("PRAGMA show_tables")


def test_ast_allows_chained_statements() -> None:
  """Verify chained commands are passed through."""
  query = "SELECT * FROM users; SELECT 1;"
  validate_query_ast(query)


def test_ast_empty_query_check() -> None:
  """Verify empty strings still raise basic errors."""
  with pytest.raises(SQLSecurityError):
    validate_query_ast("")


def test_ast_parse_error_is_logged_but_not_blocking() -> None:
  """Invalid SQL should not raise SQLSecurityError in relaxed mode."""
  # sqlglot should fail parsing this string, which exercises the warning path.
  validate_query_ast("SELECT FROM")


def test_ast_empty_parse_result_raises(monkeypatch: Any) -> None:
  """If sqlglot returns no statements, treat it as empty."""
  monkeypatch.setattr(sqlglot, "parse", lambda *_args, **_kwargs: [])

  with pytest.raises(SQLSecurityError):
    validate_query_ast("SELECT 1")
