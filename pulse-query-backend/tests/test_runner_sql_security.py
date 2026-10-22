"""
Tests for SQL Runner AST Security and Syntax Validation.

Verifies that the runner permits complex analytical SELECT and PRAGMA queries
while rejecting malformed SQL syntax and destructive DDL/DML statements at the AST level.
"""

import pytest
import sqlglot

from app.core.result import Err, ErrorCode, Ok
from app.services.runners.sql import SQLSecurityError, validate_query_ast, validate_query_ast_result


def test_ast_allows_simple_select() -> None:
  """Verify standard SELECT is allowed."""
  validate_query_ast("SELECT * FROM users")
  res = validate_query_ast_result("SELECT * FROM users")
  assert isinstance(res, Ok)
  assert res.value == "SELECT * FROM users"


def test_ast_allows_complex_cte() -> None:
  """Verify Common Table Expressions are allowed."""
  query = """
    WITH regional_sales AS (
        SELECT region, SUM(amount) as total FROM orders
    )
    SELECT * FROM regional_sales WHERE total > 100
    """
  validate_query_ast(query)


def test_ast_rejects_drop_statement() -> None:
  """Verify DROP TABLE is blocked by the runner's AST check."""
  res = validate_query_ast_result("DROP TABLE critical_data")
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.SQL_VALIDATION_ERROR
  assert "DROP" in res.error.message
  with pytest.raises(SQLSecurityError, match="Forbidden SQL statement type: DROP"):
    validate_query_ast("DROP TABLE critical_data")


def test_ast_rejects_data_modification_statements() -> None:
  """Verify DELETE, UPDATE, INSERT, CREATE, and ALTER are blocked by the AST check."""
  for stmt in (
    "DELETE FROM users",
    "UPDATE config SET val = 1",
    "INSERT INTO users VALUES (1)",
    "CREATE TABLE hacked (id INT)",
    "ALTER TABLE users ADD COLUMN x INT",
  ):
    with pytest.raises(SQLSecurityError, match="Forbidden SQL statement type"):
      validate_query_ast(stmt)


def test_ast_allows_pragma_passthrough() -> None:
  """Verify DuckDB-specific read-only commands like PRAGMA are passed through."""
  validate_query_ast("PRAGMA show_tables")


def test_ast_allows_chained_select_statements() -> None:
  """Verify chained SELECT commands are passed through."""
  query = "SELECT * FROM users; SELECT 1;"
  validate_query_ast(query)


def test_ast_empty_query_check() -> None:
  """Verify empty strings raise SQLSecurityError."""
  with pytest.raises(SQLSecurityError):
    validate_query_ast("")


def test_ast_parse_error_returns_err_and_raises() -> None:
  """Invalid SQL syntax should return Err and raise SQLSecurityError."""
  res = validate_query_ast_result("SELECT FROM WHERE ???")
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.SQL_VALIDATION_ERROR
  assert "SQL Syntax Error" in res.error.message
  with pytest.raises(SQLSecurityError, match="SQL Syntax Error"):
    validate_query_ast("SELECT FROM WHERE ???")


def test_ast_empty_parse_result_raises(monkeypatch: pytest.MonkeyPatch) -> None:
  """If sqlglot returns no statements, treat it as empty."""
  monkeypatch.setattr(sqlglot, "parse", lambda *_args, **_kwargs: [])

  with pytest.raises(SQLSecurityError):
    validate_query_ast("SELECT 1")
