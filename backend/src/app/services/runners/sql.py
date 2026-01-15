"""
SQL Runner Strategy.

This module executes SQL logic against the analytical engine.
It includes rigorous AST-based validation to ensure only read-only operations
(SELECT/CTE) are executed, protecting the database from destructive commands
even if they bypass regex filters.
"""

import logging
from typing import Dict, Any, List, Tuple
import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)


class SQLSecurityError(Exception):
  """
  Raised when a query violates security policies.
  """

  pass


def validate_query_ast(query: str) -> None:
  """
  Parses and validates the SQL query using sqlglot's Abstract Syntax Tree.
  Ensures that ONLY SELECT statements (or WITH ... SELECT) are present.

  Security Policy:
  1. Must parse successfully as valid SQL (DuckDB dialect).
  2. Must verify EVERY statement in the input string (handling semi-colon separation).
  3. Root nodes must be `SELECT` or `CTE` (Common Table Expression).
  4. Explicitly looks for and bans Modification command types (DROP, DELETE, UPDATE, etc.)
     even if nested within subqueries (though less likely in valid SQL).

  Args:
      query (str): The raw SQL string.

  Raises:
      SQLSecurityError: If the query is invalid or contains prohibited commands.
  """
  try:
    # Parse for DuckDB dialect. returns a list of Expression objects.
    statements = sqlglot.parse(query, read="duckdb")
  except sqlglot.errors.ParseError as e:
    # If we can't parse it, we don't run it.
    raise SQLSecurityError(f"Syntax Error: {str(e)}")

  if not statements:
    raise SQLSecurityError("Empty query.")

  for stmt in statements:
    # 1. Check Root Type
    # Allow SELECT
    # Allow UNION (which sqlglot might parse as Union, but root type check covers standard selects)
    # Allow WITH (CTE)
    is_safe_root = (
      isinstance(stmt, exp.Select)
      or isinstance(stmt, exp.Union)
      or isinstance(stmt, exp.CTE)  # In some versions/cases, though usually wrapped in Select
    )

    # sqlglot represents standard SELECTs as exp.Select
    # However, a CTE structure "WITH x AS (...) SELECT ..." is also rooted as exp.Select
    # (with a 'with' property).
    # We need to be wary of other statement types.

    # Explicit Deny List for anything destructive found anywhere in the tree
    # This covers cases like "CREATE TABLE x AS SELECT..." which might start non-destructively but create objects.
    # Updated for newer sqlglot versions: AlterTable -> Alter, TruncateTable -> Truncate might be generic Commands
    destructive_types = (
      exp.Drop,
      exp.Delete,
      exp.Update,
      exp.Insert,
      exp.Alter,  # Generic Alter covers Table modifications
      exp.TruncateTable,  # Covers TRUNCATE TABLE (fixed Attribute Error)
      exp.Create,
      exp.Grant,
      exp.Revoke,
      exp.Commit,
      exp.Rollback,
    )

    # Walk the entire tree of this statement to find prohibited nodes
    for node in stmt.walk():
      if isinstance(node, destructive_types):
        raise SQLSecurityError(f"Prohibited command detected: {node.key.upper()}")

    # Ensure the top-level command calculates data, doesn't manage schema.
    # "PRAGMA", "SET", "SHOW" might be allowed in some contexts,
    # but for this widget runner, we strictly enforce SELECT logic.
    if not is_safe_root:
      # Check edge case: DuckDB "PRAGMA table_info" or "SHOW TABLES" might be useful but possibly dangerous?
      # For strict read-only widgets, we deny them unless whiteliested.
      # We strictly permit SELECT logic.
      raise SQLSecurityError(f"Invalid statement type: {stmt.key.upper()}. Only SELECT allowed.")


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

  # 2. Strict AST Validation
  try:
    validate_query_ast(query)
  except SQLSecurityError as e:
    logger.warning(f"SQL Security Violation: {str(e)} | Query: {query}")
    return {"data": [], "columns": [], "error": str(e)}
  except Exception as e:
    # Fallback for unexpected parsing crashes
    logger.error(f"SQL Validation Exception: {e}")
    return {"data": [], "columns": [], "error": "Query validation failed."}

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
    error_msg = f"SQL Execution Error: {str(e)}"
    logger.error(f"SQL Widget Error: {error_msg}")
    return {"data": [], "columns": [], "error": error_msg}
