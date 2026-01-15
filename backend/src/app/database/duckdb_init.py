"""
DuckDB Initialization & Macros.

This module is responsible for initializing the DuckDB connection and registering
custom Statistical Macros and Python User Defined Functions (UDFs) during application startup.
"""

import duckdb
import logging
from app.database.duckdb import duckdb_manager
from app.services.mpax_bridge import mpax_bridge

logger = logging.getLogger(__name__)


def create_hospital_macros(conn: duckdb.DuckDBPyConnection) -> None:
  """
  Registers reusable SQL Macros and Python UDFs on the active DuckDB connection.

  Registered Extensions:
  1. PROBABILITY(condition): Calculates percentage likelihood.
  2. IS_OUTLIER(val, mean, sd): Boolean Z-Score check.
  3. IS_BOTTLENECK(adm, dis): Flow balance check. Returns TRUE if Admissions > 120% of Discharges.
  4. SAFE_DIV(num, den): Division with zero-handling.
  5. MOVING_AVERAGE(val, sort_col): 7-Day Simple Moving Average.
  6. HOLIDAY_DIFF(date_col, m, d): Days elapsed since Month/Day of that year.
  7. IS_WEEKEND(date_col): True if Saturday (6) or Sunday (0).
  8. OPTIMIZE_ASSIGNMENTS(...): Python UDF bridging to the MPAX Linear Programming solver.

  Args:
      conn (duckdb.DuckDBPyConnection): The active database connection.
  """
  try:
    # 1. Probability Calculation
    conn.execute("""
            CREATE OR REPLACE MACRO PROBABILITY(condition) AS 
            (COUNT(*) FILTER (WHERE condition) / NULLIF(COUNT(*), 0)::FLOAT) * 100
        """)

    # 2. Z-Score / Outlier Detection helper
    conn.execute("""
            CREATE OR REPLACE MACRO IS_OUTLIER(val, mean, sd) AS
            ABS(val - mean) > (2 * sd)
        """)

    # 3. Bottleneck Indicator
    # Checks if influx significantly exceeds outflux
    conn.execute("""
            CREATE OR REPLACE MACRO IS_BOTTLENECK(adm, dis) AS
            adm > (CASE WHEN dis = 0 THEN 1 ELSE dis END * 1.2)
        """)

    # 4. Safe Division (Churn Rate helper)
    conn.execute("""
            CREATE OR REPLACE MACRO SAFE_DIV(num, den) AS
            CASE WHEN den = 0 THEN 0 ELSE num / den END
        """)

    # 5. Moving Average (7-Day SMA)
    conn.execute("""
            CREATE OR REPLACE MACRO MOVING_AVERAGE(val, sort_col) AS
            AVG(val) OVER (ORDER BY sort_col ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        """)

    # 6. Holiday Difference
    conn.execute("""
            CREATE OR REPLACE MACRO HOLIDAY_DIFF(dt, m, d) AS
            date_diff('day', make_date(year(dt), m, d), dt)
        """)

    # 7. Weekend Check
    conn.execute("""
            CREATE OR REPLACE MACRO IS_WEEKEND(dt) AS
            dayofweek(dt) IN (0, 6)
        """)

    # 8. MPAX Optimization Solver UDF
    conn.create_function(
      "OPTIMIZE_ASSIGNMENTS",
      mpax_bridge.solve_unit_assignment,
      parameters=[str, str, str, str],
      return_type=str,
      side_effects=True,
    )

    logger.info("✅ DuckDB Statistical Macros & MPAX Solver UDF registered successfully.")

  except Exception as e:
    logger.error(f"❌ Failed to register DuckDB macros: {e}")


def init_duckdb_on_startup() -> None:
  """
  Lifecycle hook to run initialization logic.
  """
  conn = duckdb_manager.get_connection()
  try:
    create_hospital_macros(conn)
  finally:
    conn.close()
