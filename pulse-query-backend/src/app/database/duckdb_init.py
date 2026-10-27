"""
DuckDB Initialization & Macros.

This module monitors the application startup lifecycle to prepare the embedded
DuckDB OLAP engine. It registers custom SQL Macros (shortcuts) and User Defined
Functions (UDFs) that abstract complex hospital analytics math.

These macros allow the Text-to-SQL AI and the Human Analyst to write cleaner queries
without repeating complex mathematical formulas (e.g., Z-Scores or Window overlaps).
"""

from collections.abc import Callable
import contextlib
import logging
from typing import Protocol

import duckdb
import duckdb.sqltypes as sqltypes

from app.database.duckdb import DuckDBFetchableProtocol, duckdb_manager
from app.services.mpax_bridge import mpax_bridge

logger = logging.getLogger(__name__)


class DuckDBMacroConnProtocol(Protocol):
  """
  Structural protocol for a DuckDB connection supporting macro `execute` and UDF `create_function`.
  """

  def execute(self, query: str) -> DuckDBFetchableProtocol | None:
    """
    Executes a SQL DDL/macro statement.

    Args:
        query (str): SQL statement string.

    Returns:
        DuckDBFetchableProtocol | None: Execution result or cursor.
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
        function (Callable[..., str]): Python callable implementation.
        parameters (list[sqltypes.DuckDBPyType] | None): Parameter DuckDB types.
        return_type (sqltypes.DuckDBPyType | None): Return DuckDB type.
        side_effects (bool): Whether the UDF has side effects.

    Returns:
        DuckDBFetchableProtocol | None: Connection or registration handle.
    """


def create_hospital_macros(conn: DuckDBMacroConnProtocol | duckdb.DuckDBPyConnection) -> None:
  """
  Registers reusable SQL Macros and Python UDFs on the active DuckDB connection.

  Macros act as text-substitution functions in SQL, simplifying complex logic
  into readable function calls.

  Registered Extensions:
  --- Statistical & Logical ---
  1. PROBABILITY(condition): Calculates percentage likelihood.
  2. IS_OUTLIER(val, mean, sd): Boolean Z-Score check > 2 SD.
  3. IS_BOTTLENECK(adm, dis): Flow balance check.
  4. SAFE_DIV(num, den): Division with zero-handling.
  5. MOVING_AVERAGE(val, sort_col): 7-Day Simple Moving Average.
  6. HOLIDAY_DIFF(date_col, m, d): Days elapsed since Month/Day.
  7. IS_WEEKEND(date_col): True if Saturday (6) or Sunday (0).
  8. Z_SCORE(val, mean, sd): Calculates standard score.
  9. CORRELATION_MATRIX(x, y): Wrapper for Pearson correlation.
  10. WEEKEND_LAG(dt): Identifies admissions susceptible to "Weekend Effect".
  11. CONSECUTIVE_OVERLOAD(v1, v2, v3, cap): Boolean check for 3-day surge.
  12. SHIFT_CHANGE(dt, start_hr, end_hr): Identifies timestamps falling within a dynamic shift window.

  --- Data Engineering ---
  13. GENERATE_DATES(start_date, end_date): Table Macro. Creates a contiguous list of dates
      (Date Spine) used to fill gaps in sparse CSV data via LEFT JOINS.

  --- Python UDFs ---
  14. OPTIMIZE_ASSIGNMENTS: JAX/MPAX Solver Bridge.

  Args:
      conn (duckdb.DuckDBPyConnection): The active database connection.
  """
  try:
    # --- Timezone Configuration ---
    # Explicitly set TimeZone to UTC to prevent DATE casting shifts
    # when the server system time varies (e.g. EST vs UTC).
    conn.execute("SET TimeZone='UTC'")

    # --- Existing Macros ---

    conn.execute("""
            CREATE OR REPLACE MACRO PROBABILITY(condition) AS
            (COUNT(*) FILTER (WHERE condition) / NULLIF(COUNT(*), 0)::FLOAT) * 100
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO IS_OUTLIER(val, mean, sd) AS
            ABS(val - mean) > (2 * sd)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO IS_BOTTLENECK(adm, dis) AS
            adm > (CASE WHEN dis = 0 THEN 1 ELSE dis END * 1.2)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO SAFE_DIV(num, den) AS
            CASE WHEN den = 0 THEN 0 ELSE num / den END
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO MOVING_AVERAGE(val, sort_col) AS
            AVG(val) OVER (ORDER BY sort_col ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO HOLIDAY_DIFF(dt, m, d) AS
            date_diff('day', make_date(year(dt), m, d), dt)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO IS_WEEKEND(dt) AS
            dayofweek(dt) IN (0, 6)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO Z_SCORE(val, mu, sigma) AS
            (val - mu) / NULLIF(sigma, 0)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO CORRELATION_MATRIX(x, y) AS
            corr(CAST(x AS DOUBLE), CAST(y AS DOUBLE))
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO WEEKEND_LAG(dt) AS
            dayofweek(dt) IN (5, 6)
        """)

    conn.execute("""
            CREATE OR REPLACE MACRO CONSECUTIVE_OVERLOAD(val1, val2, val3, limit_val) AS
            (val1 > limit_val AND val2 > limit_val AND val3 > limit_val)
        """)

    # --- Dynamic Shift Awareness Update ---
    # Original: Hardcoded 18-20 (6PM-8PM)
    # New: Accepts start/end hour arguments.
    # Logic: Checks if hour(dt) is >= start and <= end (inclusive range).
    conn.execute("""
            CREATE OR REPLACE MACRO SHIFT_CHANGE(dt, start_hr, end_hr) AS
            hour(dt) BETWEEN start_hr AND end_hr
        """)

    # --- Sparse Date Handling ---
    conn.execute("""
            CREATE OR REPLACE MACRO GENERATE_DATES(start_dt, end_dt) AS TABLE
            SELECT unnest(generate_series(CAST(start_dt AS TIMESTAMP), CAST(end_dt AS TIMESTAMP), INTERVAL 1 DAY)) AS spine_date
        """)

    # --- UDFs (Python Bridges) ---

    with contextlib.suppress(duckdb.Error):
      conn.create_function(
        "OPTIMIZE_ASSIGNMENTS",
        mpax_bridge.solve_unit_assignment,
        parameters=[sqltypes.VARCHAR, sqltypes.VARCHAR, sqltypes.VARCHAR, sqltypes.VARCHAR],
        return_type=sqltypes.VARCHAR,
        side_effects=True,
      )

    logger.info("✅ DuckDB Statistical Macros (Dynamic Shift) & MPAX Solver UDF registered successfully.")

  except Exception as e:
    logger.error(f"❌ Failed to register DuckDB macros ({type(e).__name__}): {e}")


def init_duckdb_on_startup() -> None:
  """
  Lifecycle hook to run initialization logic.
  Called by main.py during FastAPI startup event.
  """
  conn = duckdb_manager.get_connection()
  try:
    create_hospital_macros(conn)
  finally:
    conn.close()
