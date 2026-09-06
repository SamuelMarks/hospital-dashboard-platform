"""
DuckDB connection management for analytics workloads.

Provides a thin wrapper for read-write and read-only connections and a FastAPI
dependency helper for OLAP access.
"""

import logging
import os
from collections.abc import Generator
from typing import Any

import duckdb

from app.core.config import settings
from app.core.diagnostics import diagnostics_registry, format_duckdb_error_banner

logger = logging.getLogger(__name__)


class DuckDBManager:
  """
  Wrapper for DuckDB connection management.
  Ensures consistent configuration for accessing the analytics data.
  Provides distinction between Read-Write (Ingestion) and Read-Only (Analytics) modes.
  """

  def __init__(self, db_path: str):
    """
    Initialize the manager with a file path.

    Args:
        db_path (str): Path to the .duckdb file.
    """
    self.db_path = db_path

  def validate_duckdb_storage(self) -> dict[str, Any]:
    """
    Validates DuckDB database file storage, checks for locks or corruption,
    and inventories registered tables and row counts.

    Returns:
        dict[str, Any]: Diagnostic dictionary with DuckDB status, tables, and total rows.
    """
    if self.db_path != ":memory:":
      parent_dir = os.path.dirname(os.path.abspath(self.db_path))
      if parent_dir and not os.path.exists(parent_dir):
        try:
          os.makedirs(parent_dir, exist_ok=True)
        except OSError as e:
          error_str = f"Cannot create database parent directory '{parent_dir}': {e}"
          banner = format_duckdb_error_banner(self.db_path, error_str)
          logger.error("\n" + banner)
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
          table_name = row[0]
          try:
            count_res = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            tables_map[table_name] = count_res[0] if count_res else 0
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
      logger.error("\n" + banner)
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
      return conn
    except Exception as e:
      logger.error(f"Failed to connect to DuckDB at {self.db_path}: {e}")
      raise e

  def get_readonly_connection(self) -> duckdb.DuckDBPyConnection:
    """
    Opens a restricted Read-Only connection.
    Used exclusively for Analytics Execution (User SQL Widgets).

    Configuration:
    - `read_only=True`: Prevents DML (INSERT/UPDATE/DELETE) and DDL (DROP/ALTER) operations
      at the engine level.

    Returns:
        duckdb.DuckDBPyConnection: A secured database connection.
    """
    try:
      # Enforce read-only mode at the connection level
      conn = duckdb.connect(database=self.db_path, read_only=True)
      return conn
    except Exception as e:
      logger.error(f"Failed to open Read-Only DuckDB connection: {e}")
      raise e


# Global instance configured with settings parameters
duckdb_manager = DuckDBManager(settings.DUCKDB_PATH)


def get_olap_db() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  FastAPI Dependency.
  Yields a standard DuckDB connection and ensures it closes after the request.
  Useful for Admin operations or Schema introspection.
  """
  conn = duckdb_manager.get_connection()
  try:
    yield conn
  finally:
    conn.close()
