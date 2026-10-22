"""
SQL Runner Strategy.

This module executes SQL logic against the analytical engine.
Security is primarily enforced by the Database Connection itself (Read-Only Mode).
We perform basic syntax checking but defer execution policy to DuckDB.
"""

import asyncio
from collections.abc import Sequence
import logging
from typing import Any, Protocol

import sqlglot
from sqlglot import exp

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.execution import SqlRunnerPayload, SqlRunnerResultDict

logger = logging.getLogger(__name__)

_FORBIDDEN_AST_TYPES: tuple[type[exp.Expression], ...] = (
  exp.Drop,
  exp.Delete,
  exp.Update,
  exp.Insert,
  exp.Alter,
  exp.Create,
)


class DuckDBCursorProtocol(Protocol):
  """
  Structural protocol representing a DuckDB connection or cursor capable of executing SQL.
  """

  @property
  def description(self) -> Sequence[Sequence[Any]] | None:
    """Column metadata sequence for the most recent query result."""

  def execute(self, query: str) -> object:
    """
    Executes a SQL query string on the cursor.

    Args:
        query (str): SQL query string to execute.

    Returns:
        object: Cursor or execution result.
    """

  def fetchall(self) -> list[tuple[Any, ...]]:
    """
    Fetches all remaining rows from the last executed query.

    Returns:
        list[tuple[Any, ...]]: Sequence of row tuples.
    """

  def fetchmany(self, size: int = 1) -> list[tuple[Any, ...]]:
    """
    Fetches up to `size` rows from the last executed query.

    Args:
        size (int): Maximum number of rows to fetch.

    Returns:
        list[tuple[Any, ...]]: Sequence of row tuples.
    """


class SQLSecurityError(Exception):
  """
  Raised when a query violates security policies (Legacy checking).
  """


def validate_query_ast_result(query: str) -> AppResult[str]:
  """
  Validates a SQL query string and returns an explicit `AppResult[str]`.

  Args:
      query (str): Raw SQL string to validate.

  Returns:
      AppResult[str]: `Ok(cleaned_query)` if non-empty and valid, or `Err(AppError)` if empty.
  """
  if not query or not query.strip():
    return Err(
      AppError(
        code=ErrorCode.SQL_VALIDATION_ERROR,
        message="Empty query.",
        status_code=400,
      )
    )

  cleaned = query.strip()
  try:
    statements = sqlglot.parse(cleaned, read="duckdb")
    if not statements or statements[0] is None:
      return Err(
        AppError(
          code=ErrorCode.SQL_VALIDATION_ERROR,
          message="Empty query.",
          status_code=400,
        )
      )
    for stmt in statements:
      if stmt is not None and isinstance(stmt, _FORBIDDEN_AST_TYPES):
        return Err(
          AppError(
            code=ErrorCode.SQL_VALIDATION_ERROR,
            message=f"Forbidden SQL statement type: {stmt.key.upper()}",
            status_code=400,
          )
        )
  except sqlglot.errors.ParseError as e:
    logger.warning(f"SQLParse Warning: {e}")
    return Err(
      AppError(
        code=ErrorCode.SQL_VALIDATION_ERROR,
        message=f"SQL Syntax Error: {e}",
        status_code=400,
      )
    )

  return Ok(cleaned)


def validate_query_ast(query: str) -> None:
  """
  Parses the SQL query to ensure it is valid SQL structure.

  Args:
      query (str): The raw SQL string.

  Raises:
      SQLSecurityError: If the query cannot be parsed or is empty.
  """
  res = validate_query_ast_result(query)
  if isinstance(res, Err):
    raise SQLSecurityError(res.error.message)


def execute_sql_result(cursor: DuckDBCursorProtocol, config: dict[str, Any]) -> AppResult[SqlRunnerPayload]:
  """
  Executes a SQL query against a DuckDB cursor and returns a strongly typed `AppResult[SqlRunnerPayload]`.

  Args:
      cursor (DuckDBCursorProtocol): Active DuckDB cursor object.
      config (dict[str, Any]): Widget configuration dictionary containing `query` and optional `max_rows`.

  Returns:
      AppResult[SqlRunnerPayload]: `Ok(SqlRunnerPayload)` on success, or `Err(AppError)` on validation/execution failure.
  """
  query: str = str(config.get("query", "")).strip()
  if not query:
    return Err(
      AppError(
        code=ErrorCode.SQL_VALIDATION_ERROR,
        message="Missing SQL query in widget configuration.",
        status_code=400,
      )
    )

  ast_res = validate_query_ast_result(query)
  if isinstance(ast_res, Err):
    logger.warning(f"AST Parse Warning: {ast_res.error.message}")

  try:
    logger.debug(f"Executing SQL Widget: {query}")
    cursor.execute(query)

    if cursor.description:
      columns: list[str] = [str(desc[0]) for desc in cursor.description]
      max_rows = config.get("max_rows")
      rows = cursor.fetchmany(max_rows) if isinstance(max_rows, int) and max_rows > 0 else cursor.fetchall()
      results: list[dict[str, Any]] = [dict(zip(columns, row, strict=False)) for row in rows]
      return Ok(SqlRunnerPayload(data=results, columns=columns))
    return Ok(SqlRunnerPayload(data=[], columns=[]))
  except Exception as e:
    error_msg = f"SQL Execution Error: {e!s}"
    logger.error(f"SQL Widget Error: {error_msg}")
    return Err(
      AppError(
        code=ErrorCode.SQL_EXECUTION_ERROR,
        message=error_msg,
        status_code=400,
      )
    )


def run_sql_widget(cursor: DuckDBCursorProtocol, config: dict[str, Any]) -> SqlRunnerResultDict:
  """
  Executes a SQL query within a protected environment.

  Args:
      cursor (DuckDBCursorProtocol): An active DuckDB standard cursor object.
      config (dict[str, Any]): The configuration dictionary containing the `query`.

  Returns:
      SqlRunnerResultDict: Execution result containing `data`, `columns`, and `error`.
  """
  result = execute_sql_result(cursor, config)
  if isinstance(result, Ok):
    return {
      "data": result.value.data,
      "columns": result.value.columns,
      "error": None,
    }
  return {
    "data": [],
    "columns": [],
    "error": result.error.message,
  }


async def run_sql_widget_async(cursor: DuckDBCursorProtocol, config: dict[str, Any]) -> SqlRunnerResultDict:
  """
  Asynchronously executes a SQL widget query in a worker thread via `asyncio.to_thread`.

  Args:
      cursor (DuckDBCursorProtocol): Active DuckDB cursor object.
      config (dict[str, Any]): Widget configuration dictionary.

  Returns:
      SqlRunnerResultDict: Execution result dictionary containing `data`, `columns`, and `error`.
  """
  return await asyncio.to_thread(run_sql_widget, cursor, config)
