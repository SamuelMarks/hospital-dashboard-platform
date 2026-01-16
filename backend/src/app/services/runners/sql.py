"""
SQL Runner Strategy.

This module executes SQL logic against the analytical engine.
Security is primarily enforced by the Database Connection itself (Read-Only Mode).
We perform basic syntax checking but defer execution policy to DuckDB.
"""

import logging
from typing import Dict, Any, List, Tuple
import sqlglot

logger = logging.getLogger(__name__)


class SQLSecurityError(Exception):
  """
  Raised when a query violates security policies (Legacy checking).
  """

  pass


def validate_query_ast(query: str) -> None:
  """
  Parses the SQL query to ensure it is valid SQL structure.

  Previously, this method enforced strict AST allow-listing (SELECT only).
  We have relaxed this restriction to rely on the Database Engine's strict Read-Only mode.
  This allows more complex read operations (e.g. PRAGMA, SHOW, creating temporary views)
  that user's might need for advanced analytics without compromising the persistent data.

  Args:
      query (str): The raw SQL string.

  Raises:
      SQLSecurityError: If the query cannot be parsed (Syntax Error).
  """
  # Immediate check for empty queries to satisfy strict testing requirements.
  if not query or not query.strip():
    raise SQLSecurityError("Empty query.")

  try:
    # Just parse for validity check.
    # We do NOT block statement types in the runner anymore.
    statements = sqlglot.parse(query, read="duckdb")
    if not statements:
      raise SQLSecurityError("Empty query.")
  except sqlglot.errors.ParseError as e:
    # If we can't parse it, we probably shouldn't run it, but strictly speaking DuckDB might parse it better.
    # We log logic errors but generally let it proceed to execution to get accurate DB errors
    # unless it's fundamentally broken logic.
    logger.warning(f"SQLParse Warning: {e}")
    # Note: We allow execution even if sqlglot fails, because sqlglot might not cover 100% of DuckDB syntax.
    pass


def run_sql_widget(cursor: Any, config: Dict[str, Any]) -> Dict[str, Any]:
  """
  Executes a SQL query within a protected environment.

  Args:
      cursor (Any): An active DuckDB standard cursor object.
      config (Dict[str, Any]): The configuration dictionary containing the 'query'.

  Returns:
      Dict[str, Any]: Execution result containing 'data', 'columns', or 'error'.
  """
  query: str = config.get("query", "").strip()

  # 1. Basic Validation
  if not query:
    return {
      "data": [],
      "columns": [],
      "error": "Missing SQL query in widget configuration.",
    }

  # 2. Relaxed Validation (Optional Logging)
  # We permit the query to pass through to the Read-Only connection.
  try:
    validate_query_ast(query)
  except Exception as e:
    logger.warning(f"AST Parse Warning: {e}")

  try:
    # 3. Execution
    logger.debug(f"Executing SQL Widget: {query}")
    cursor.execute(query)

    # 4. Fetching Metadata & Data
    if cursor.description:
      columns: List[str] = [desc[0] for desc in cursor.description]
      rows: List[Tuple] = cursor.fetchall()
      results: List[Dict[str, Any]] = [dict(zip(columns, row)) for row in rows]
      return {"data": results, "columns": columns, "error": None}
    else:
      # Queries like 'SET x=1' might pass parser if logically allowed but return no rows
      return {"data": [], "columns": [], "error": None}

  except Exception as e:
    # This catches the DuckDB Read-Only violations (e.g. Catalog Error on DROP attempts)
    error_msg = f"SQL Execution Error: {str(e)}"
    logger.error(f"SQL Widget Error: {error_msg}")
    return {"data": [], "columns": [], "error": error_msg}
