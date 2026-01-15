import duckdb
from typing import Generator
from app.core.config import settings
import logging

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
