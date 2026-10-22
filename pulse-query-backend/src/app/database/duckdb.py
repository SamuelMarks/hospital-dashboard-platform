"""
DuckDB connection management for analytics workloads.

Provides a thin wrapper for read-write and read-only connections and a FastAPI
dependency helper for OLAP access.
"""

import asyncio
from collections.abc import Callable, Generator
import contextlib
import logging
import os
import threading
import time
from typing import Any, ParamSpec, Protocol, TypeVar

import duckdb
import duckdb.sqltypes as sqltypes

from app.core.config import settings
from app.core.diagnostics import diagnostics_registry, format_duckdb_error_banner
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.services.mpax_bridge import mpax_bridge

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


class DuckDBFetchableProtocol(Protocol):
  """
  Structural protocol representing a DuckDB query result supporting `fetchall` and `fetchone`.
  """

  def fetchall(self) -> list[tuple[Any, ...]]:
    """
    Fetches all rows from the query result.

    Returns:
        list[tuple[Any, ...]]: List of row tuples.
    """

  def fetchone(self) -> tuple[Any, ...] | None:
    """
    Fetches the next row from the query result.

    Returns:
        tuple[Any, ...] | None: Single row tuple or None.
    """


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


def register_duckdb_udfs(conn: duckdb.DuckDBPyConnection) -> None:
  """
  Registers Python User-Defined Functions (UDFs) on a DuckDB connection if supported.

  Because DuckDB Python UDFs are connection-scoped (unlike catalog SQL macros),
  this helper ensures `OPTIMIZE_ASSIGNMENTS` is available on every connection.

  Args:
      conn (duckdb.DuckDBPyConnection): Active DuckDB connection or test double.
  """
  create_fn = getattr(conn, "create_function", None)
  if callable(create_fn):
    with contextlib.suppress(Exception):
      create_fn(
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

  def validate_duckdb_storage(self) -> dict[str, Any]:
    """
    Validates DuckDB database file storage, checks for locks or corruption,
    and inventories registered tables and row counts.

    Returns:
        dict[str, Any]: Diagnostic dictionary with DuckDB status, tables, and total rows.
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
          diagnostics_registry.duckdb_status = {
            "status": "error",
            "path": self.db_path,
            "tables": {},
            "total_tables": 0,
            "error": error_str,
          }
          diagnostics_registry.add_warning(
            code="DUCKDB_STORAGE_ERROR",
            message=error_str,
            severity="critical",
            remediation="Ensure write permissions for the directory containing the DuckDB file.",
          )
          return diagnostics_registry.duckdb_status

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
            tables_map[table_name] = int(count_res[0]) if count_res else 0
          except Exception:
            tables_map[table_name] = -1

        diagnostics_registry.duckdb_status = {
          "status": "ready",
          "path": self.db_path,
          "tables": tables_map,
          "total_tables": len(tables_map),
          "error": None,
        }
        if not tables_map:
          diagnostics_registry.add_warning(
            code="NO_DUCKDB_TABLES",
            message="No analytics tables found in DuckDB. Auto-ingestion may be pending.",
            severity="warning",
            remediation="Run data ingestion or place CSV files in pulse-query-backend/data/.",
          )
        return diagnostics_registry.duckdb_status
      finally:
        conn.close()
    except Exception as e:
      error_str = str(e)
      banner = format_duckdb_error_banner(self.db_path, error_str)
      logger.error(f"{nl}{banner}")
      diagnostics_registry.duckdb_status = {
        "status": "error",
        "path": self.db_path,
        "tables": {},
        "total_tables": 0,
        "error": error_str,
      }
      diagnostics_registry.add_warning(
        code="DUCKDB_STORAGE_ERROR",
        message=f"Failed to access DuckDB storage: {error_str}",
        severity="critical",
        remediation="Check if another process has locked the DuckDB file or if the database is corrupted.",
      )
      return diagnostics_registry.duckdb_status

  def validate_duckdb_storage_result(self) -> AppResult[dict[str, Any]]:
    """
    Validates DuckDB storage health and returns an explicit `AppResult` wrapping the status dictionary.

    Returns:
        AppResult[dict[str, Any]]: `Ok(status)` when ready, or `Err(AppError)` with `DUCKDB_STORAGE_ERROR`.
    """
    status_dict = self.validate_duckdb_storage()
    if status_dict.get("status") == "error":
      return Err(
        AppError(
          code=ErrorCode.DUCKDB_STORAGE_ERROR,
          message=str(status_dict.get("error") or "DuckDB storage error"),
          status_code=503,
          details=status_dict,
        )
      )
    return Ok(status_dict)

  def get_connection(self) -> duckdb.DuckDBPyConnection:
    """
    Opens a standard Read-Write connection to the DuckDB file.
    Used for Ingestion, Seeding, and Schema Initialization.

    Returns:
        duckdb.DuckDBPyConnection: An active database connection.

    Raises:
        Exception: If connection fails.
    """
    try:
      conn = duckdb.connect(database=self.db_path, read_only=False)
      register_duckdb_udfs(conn)
      return conn
    except Exception as e:
      logger.error(f"Failed to connect to DuckDB at {self.db_path}: {e}")
      raise e

  def get_readonly_connection(self, max_retries: int = 3) -> duckdb.DuckDBPyConnection:
    """
    Opens a restricted Read-Only connection with retry logic for transient file locks.
    Used exclusively for Analytics Execution (User SQL Widgets).

    Args:
        max_retries (int): Maximum retry attempts for transient file lock contention.

    Returns:
        duckdb.DuckDBPyConnection: A secured database connection.

    Raises:
        Exception: If connection fails after retries.
    """
    for attempt in range(max_retries):
      try:
        if self.db_path == ":memory:":
          conn = duckdb.connect(database=":memory:", read_only=False, config={"enable_external_access": "false"})
        else:
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
