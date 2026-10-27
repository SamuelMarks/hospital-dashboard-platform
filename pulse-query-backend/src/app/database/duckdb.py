"""
DuckDB connection management for analytics workloads.

Provides a thin wrapper for read-write and read-only connections and a FastAPI
dependency helper for OLAP access.
"""

import asyncio
from collections.abc import Callable, Generator, Sequence
import contextlib
import logging
import os
import threading
import time
from typing import ParamSpec, Protocol, TypeVar, runtime_checkable

import duckdb
import duckdb.sqltypes as sqltypes

from app.core.config import settings
from app.core.diagnostics import (
  DuckDBDiagnosticState,
  DuckDbStatusDict,
  diagnostics_registry,
  format_duckdb_error_banner,
)
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import SqlScalar
from app.services.mpax_bridge import mpax_bridge

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


class DuckDBFetchableProtocol(Protocol):
  """
  Structural protocol representing a DuckDB query result supporting `fetchall` and `fetchone`.
  """

  def fetchall(self) -> list[tuple[SqlScalar, ...]]:
    """
    Fetches all rows from the query result.

    Returns:
        list[tuple[SqlScalar, ...]]: List of row tuples.
    """

  def fetchone(self) -> tuple[SqlScalar, ...] | None:
    """
    Fetches the next row from the query result.

    Returns:
        tuple[SqlScalar, ...] | None: Single row tuple or None.
    """


class DuckDBCursorProtocol(DuckDBFetchableProtocol, Protocol):
  """
  Structural protocol representing a DuckDB cursor with `description`, `execute`, `fetchall`, and `close`.
  """

  @property
  def description(self) -> Sequence[Sequence[str | int | None]] | None:
    """
    Returns cursor column metadata tuples after query execution.

    Returns:
        Sequence[Sequence[str | int | None]] | None: Column descriptors or None.
    """

  def execute(self, query: str) -> DuckDBFetchableProtocol:
    """
    Executes a SQL query string on the cursor.

    Args:
        query (str): SQL query string to execute.

    Returns:
        DuckDBFetchableProtocol: Query result object supporting `fetchall()` / `fetchone()`.
    """

  def close(self) -> None:
    """Closes the cursor."""


class DuckDBConnectionProtocol(Protocol):
  """
  Structural protocol representing a DuckDB connection object or test double.
  """

  def execute(self, query: str) -> DuckDBFetchableProtocol:
    """
    Executes a SQL query string and returns a cursor/result object.

    Args:
        query (str): SQL query string to execute.

    Returns:
        DuckDBFetchableProtocol: Cursor or query result object supporting `fetchall()` / `fetchone()`.
    """

  def close(self) -> None:
    """Closes the database connection."""


from app.services.runners.sql import validate_query_ast_result  # noqa: E402


def ensure_readonly_sql(query: str) -> None:
  """
  Verifies via SQLGlot AST inspection that `query` is strictly a read-only `SELECT` / `WITH` statement.

  Args:
      query (str): SQL query string to validate.

  Raises:
      duckdb.InvalidInputException: If `query` contains any write, DDL, or administrative command.
  """
  check = validate_query_ast_result(query)
  if isinstance(check, Err):
    raise duckdb.InvalidInputException(f"Read-only mode violation: cannot modify database ({check.error.message})")


class ReadOnlyDuckDBCursorProxy:
  """
  Read-only cursor wrapper enforcing AST-level read-only validation before delegating to a DuckDB cursor.
  """

  def __init__(self, inner: duckdb.DuckDBPyConnection) -> None:
    """
    Initializes the read-only cursor proxy around `inner`.

    Args:
        inner (duckdb.DuckDBPyConnection): Underlying DuckDB cursor or connection.
    """
    self._inner = inner

  @property
  def description(self) -> Sequence[Sequence[str | int | None]] | None:
    """Returns cursor column metadata tuples after query execution."""
    raw_desc = self._inner.description
    if raw_desc is None:
      return None
    return [(str(col[0]),) for col in raw_desc]

  def execute(self, query: str) -> "ReadOnlyDuckDBCursorProxy":
    """
    Validates that `query` is read-only and executes it on the underlying cursor.

    Args:
        query (str): SQL query string to execute.

    Returns:
        ReadOnlyDuckDBCursorProxy: Self after executing the query.
    """
    ensure_readonly_sql(query)
    self._inner.execute(query)
    return self

  def fetchall(self) -> list[tuple[SqlScalar, ...]]:
    """Fetches all rows from the query result."""
    return self._inner.fetchall()

  def fetchone(self) -> tuple[SqlScalar, ...] | None:
    """Fetches the next row from the query result."""
    return self._inner.fetchone()

  def close(self) -> None:
    """Closes the underlying cursor."""
    self._inner.close()


class ReadOnlyDuckDBConnectionProxy:
  """
  Read-only connection wrapper used for `:memory:` databases where DuckDB disallows `read_only=True`.
  Enforces `ensure_readonly_sql` on `.execute()` and `.cursor()`.
  """

  def __init__(self, inner: duckdb.DuckDBPyConnection) -> None:
    """
    Initializes the read-only connection proxy around `inner`.

    Args:
        inner (duckdb.DuckDBPyConnection): Underlying DuckDB connection.
    """
    self._inner = inner

  @property
  def inner(self) -> duckdb.DuckDBPyConnection:
    """Returns the underlying DuckDB connection."""
    return self._inner

  def cursor(self) -> ReadOnlyDuckDBCursorProxy:
    """Returns a `ReadOnlyDuckDBCursorProxy` wrapping a new DuckDB cursor."""
    return ReadOnlyDuckDBCursorProxy(self._inner.cursor())

  def execute(self, query: str) -> ReadOnlyDuckDBCursorProxy:
    """
    Validates that `query` is read-only and executes it on the underlying connection.

    Args:
        query (str): SQL query string to execute.

    Returns:
        ReadOnlyDuckDBCursorProxy: Read-only proxy wrapping the execution result.
    """
    ensure_readonly_sql(query)
    self._inner.execute(query)
    return ReadOnlyDuckDBCursorProxy(self._inner)

  def close(self) -> None:
    """Closes the underlying connection."""
    self._inner.close()


@runtime_checkable
class DuckDBUdfConnectionProtocol(Protocol):
  """
  Runtime-checkable protocol for DuckDB connections supporting scalar UDF registration via `create_function`.
  """

  def create_function(
    self,
    name: str,
    function: Callable[..., str],
    parameters: list[sqltypes.DuckDBPyType] | None = None,
    return_type: sqltypes.DuckDBPyType | None = None,
    *,
    side_effects: bool = False,
  ) -> DuckDBFetchableProtocol | None:
    """
    Registers a Python callable as a DuckDB scalar UDF.

    Args:
        name (str): SQL function identifier.
        function (Callable[..., str]): Python function implementation.
        parameters (list[sqltypes.DuckDBPyType] | None): Parameter DuckDB types.
        return_type (sqltypes.DuckDBPyType | None): Return DuckDB type.
        side_effects (bool): Whether the function has side effects.

    Returns:
        DuckDBFetchableProtocol | None: Connection or registration handle.
    """


def register_duckdb_udfs(
  conn: duckdb.DuckDBPyConnection | DuckDBUdfConnectionProtocol | DuckDBConnectionProtocol,
) -> None:
  """
  Registers Python User-Defined Functions (UDFs) on a DuckDB connection if supported.

  Because DuckDB Python UDFs are connection-scoped (unlike catalog SQL macros),
  this helper ensures `OPTIMIZE_ASSIGNMENTS` is available on every connection.

  Args:
      conn (duckdb.DuckDBPyConnection | DuckDBUdfConnectionProtocol | DuckDBConnectionProtocol):
          Active DuckDB connection or test double.
  """
  if isinstance(conn, DuckDBUdfConnectionProtocol):
    with contextlib.suppress(Exception):
      conn.create_function(
        "OPTIMIZE_ASSIGNMENTS",
        mpax_bridge.solve_unit_assignment,
        parameters=[sqltypes.VARCHAR, sqltypes.VARCHAR, sqltypes.VARCHAR, sqltypes.VARCHAR],
        return_type=sqltypes.VARCHAR,
        side_effects=True,
      )


async def run_in_duckdb_thread(func: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
  """
  Executes a synchronous DuckDB operation in a background worker thread via `asyncio.to_thread`.

  Args:
      func (Callable[P, T]): Synchronous callable performing DuckDB work.
      *args (P.args): Positional arguments forwarded to `func`.
      **kwargs (P.kwargs): Keyword arguments forwarded to `func`.

  Returns:
      T: The return value of `func(*args, **kwargs)`.
  """
  return await asyncio.to_thread(func, *args, **kwargs)


class DuckDBManager:
  """
  Wrapper for DuckDB connection management.
  Ensures consistent configuration for accessing the analytics data.
  Provides distinction between Read-Write (Ingestion) and Read-Only (Analytics) modes.
  """

  def __init__(self, db_path: str) -> None:
    """
    Initialize the manager with a file path.

    Args:
        db_path (str): Path to the .duckdb file.
    """
    self.db_path = db_path
    self._write_lock = threading.RLock()

  def validate_duckdb_storage(self) -> DuckDbStatusDict:
    """
    Validates DuckDB database file storage, checks for locks or corruption,
    and inventories registered tables and row counts.

    Returns:
        DuckDbStatusDict: Diagnostic dictionary with DuckDB status, tables, and total rows.
    """
    nl = chr(10)
    if self.db_path != ":memory:":
      parent_dir = os.path.dirname(os.path.abspath(self.db_path))
      if parent_dir and not os.path.exists(parent_dir):
        try:
          os.makedirs(parent_dir, exist_ok=True)
        except OSError as e:
          error_str = f"Cannot create database parent directory '{parent_dir}': {e}"
          banner = format_duckdb_error_banner(self.db_path, error_str)
          logger.error(f"{nl}{banner}")
          diagnostics_registry.duckdb_status = DuckDBDiagnosticState(
            status="error",
            path=self.db_path,
            tables={},
            total_tables=0,
            error=error_str,
          )
          diagnostics_registry.add_warning(
            code="DUCKDB_STORAGE_ERROR",
            message=error_str,
            severity="critical",
            remediation="Ensure write permissions for the directory containing the DuckDB file.",
          )
          return diagnostics_registry.duckdb_status.to_dict()

    try:
      conn = self.get_connection()
      try:
        raw_tables = conn.execute("SHOW TABLES").fetchall()
        tables_map: dict[str, int] = {}
        for row in raw_tables:
          table_name = str(row[0])
          safe_table = table_name.replace('"', '""')
          try:
            count_res = conn.execute(f'SELECT COUNT(*) FROM "{safe_table}"').fetchone()
            tables_map[table_name] = int(str(count_res[0])) if count_res and count_res[0] is not None else 0
          except Exception:
            tables_map[table_name] = -1

        diagnostics_registry.duckdb_status = DuckDBDiagnosticState(
          status="ready",
          path=self.db_path,
          tables=tables_map,
          total_tables=len(tables_map),
          error=None,
        )
        if not tables_map:
          diagnostics_registry.add_warning(
            code="NO_DUCKDB_TABLES",
            message="No analytics tables found in DuckDB. Auto-ingestion may be pending.",
            severity="warning",
            remediation="Run data ingestion or place CSV files in pulse-query-backend/data/.",
          )
        return diagnostics_registry.duckdb_status.to_dict()
      finally:
        conn.close()
    except Exception as e:
      error_str = str(e)
      banner = format_duckdb_error_banner(self.db_path, error_str)
      logger.error(f"{nl}{banner}")
      diagnostics_registry.duckdb_status = DuckDBDiagnosticState(
        status="error",
        path=self.db_path,
        tables={},
        total_tables=0,
        error=error_str,
      )
      diagnostics_registry.add_warning(
        code="DUCKDB_STORAGE_ERROR",
        message=f"Failed to access DuckDB storage: {error_str}",
        severity="critical",
        remediation="Check if another process has locked the DuckDB file or if the database is corrupted.",
      )
      return diagnostics_registry.duckdb_status.to_dict()

  def validate_duckdb_storage_result(self) -> AppResult[DuckDbStatusDict]:
    """
    Validates DuckDB storage health and returns an explicit `AppResult` wrapping the status dictionary.

    Returns:
        AppResult[DuckDbStatusDict]: `Ok(status)` when ready, or `Err(AppError)` with `DUCKDB_STORAGE_ERROR`.
    """
    status_dict = self.validate_duckdb_storage()
    if status_dict.get("status") == "error":
      raw_tables = status_dict.get("tables")
      return Err(
        AppError(
          code=ErrorCode.DUCKDB_STORAGE_ERROR,
          message=str(status_dict.get("error") or "DuckDB storage error"),
          status_code=503,
          details={
            "status": status_dict.get("status"),
            "path": status_dict.get("path"),
            "tables": {k: v for k, v in raw_tables.items()} if isinstance(raw_tables, dict) else {},
            "total_tables": status_dict.get("total_tables"),
            "error": status_dict.get("error"),
          },
        )
      )
    return Ok(status_dict)

  def get_connection(self, max_retries: int = 5) -> duckdb.DuckDBPyConnection:
    """
    Opens a standard Read-Write connection to the DuckDB file with retry backoff on transient locks.
    Used for Ingestion, Seeding, and Schema Initialization.

    Args:
        max_retries (int): Maximum retry attempts for transient file lock contention.

    Returns:
        duckdb.DuckDBPyConnection: An active database connection.

    Raises:
        Exception: If connection fails.
    """
    for attempt in range(max_retries):
      try:
        conn = duckdb.connect(database=self.db_path, read_only=False)
        register_duckdb_udfs(conn)
        return conn
      except duckdb.IOException as e:
        if "lock" in str(e).lower() and attempt < max_retries - 1:
          logger.warning(f"DuckDB locked, retrying read-write connection ({attempt + 1}/{max_retries})...")
          time.sleep(0.05 * (attempt + 1))
          continue
        logger.error(f"Failed to connect to DuckDB at {self.db_path}: {e}")
        raise e
      except Exception as e:
        logger.error(f"Failed to connect to DuckDB at {self.db_path}: {e}")
        raise e
    raise duckdb.IOException(f"Failed to open DuckDB connection after {max_retries} retries.")

  def get_readonly_connection(self, max_retries: int = 3) -> duckdb.DuckDBPyConnection:
    """
    Opens a restricted Read-Only connection with retry logic for transient file locks.
    Used exclusively for Analytics Execution (User SQL Widgets).

    Args:
        max_retries (int): Maximum retry attempts for transient file lock contention.

    Returns:
        duckdb.DuckDBPyConnection: A secured read-only database connection.

    Raises:
        Exception: If connection fails after retries.
    """
    for attempt in range(max_retries):
      try:
        if self.db_path == ":memory:":
          raw_conn = duckdb.connect(database=":memory:", read_only=False, config={"enable_external_access": "false"})
          register_duckdb_udfs(raw_conn)
          proxy_conn: duckdb.DuckDBPyConnection = ReadOnlyDuckDBConnectionProxy(raw_conn)  # type: ignore[assignment]
          return proxy_conn
        conn = duckdb.connect(database=self.db_path, read_only=True, config={"enable_external_access": "false"})
        register_duckdb_udfs(conn)
        return conn
      except duckdb.IOException as e:
        if "lock" in str(e).lower() and attempt < max_retries - 1:
          logger.warning(f"DuckDB locked, retrying readonly connection ({attempt + 1}/{max_retries})...")
          time.sleep(0.05 * (attempt + 1))
          continue
        logger.error(f"Failed to open Read-Only DuckDB connection: {e}")
        raise e
      except Exception as e:
        logger.error(f"Failed to open Read-Only DuckDB connection: {e}")
        raise e
    raise duckdb.IOException(f"Failed to open DuckDB connection after {max_retries} retries.")


# Global instance configured with settings parameters
duckdb_manager = DuckDBManager(settings.DUCKDB_PATH)


def get_olap_db() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  FastAPI Dependency.
  Yields a standard DuckDB connection and ensures it closes after the request.
  Useful for Admin operations or Schema introspection.

  Yields:
      duckdb.DuckDBPyConnection: Active Read-Write DuckDB connection.
  """
  conn = duckdb_manager.get_connection()
  try:
    yield conn
  finally:
    conn.close()


def get_readonly_olap_db() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  FastAPI Dependency.
  Yields a sandboxed Read-Only DuckDB connection and ensures it closes after the request.

  Yields:
      duckdb.DuckDBPyConnection: Active Read-Only DuckDB connection.
  """
  conn = duckdb_manager.get_readonly_connection()
  try:
    yield conn
  finally:
    conn.close()
