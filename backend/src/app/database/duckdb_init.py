"""
DuckDB Initialization & Macros.

This module monitors the application startup lifecycle to prepare the embedded
DuckDB OLAP engine. It registers custom SQL Macros (shortcuts) and User Defined
Functions (UDFs) that abstract complex hospital analytics math.

These macros allow the Text-to-SQL AI and the Human Analyst to write cleaner queries
without repeating complex mathematical formulas (e.g., Z-Scores or Window overlaps).
"""

import duckdb
import logging
from app.database.duckdb import duckdb_manager
from app.services.mpax_bridge import mpax_bridge

logger = logging.getLogger(__name__)


def create_hospital_macros(conn: duckdb.DuckDBPyConnection) -> None:
  """
  Registers reusable SQL Macros and Python UDFs on the active DuckDB connection.

  Macros act as text-substitution functions in SQL, simplifying complex logic
  into readable function calls.

  Registered Extensions:
  --- Existing ---
  1. PROBABILITY(condition): Calculates percentage likelihood.
  2. IS_OUTLIER(val, mean, sd): Boolean Z-Score check > 2 SD.
  3. IS_BOTTLENECK(adm, dis): Flow balance check.
  4. SAFE_DIV(num, den): Division with zero-handling.
  5. MOVING_AVERAGE(val, sort_col): 7-Day Simple Moving Average.
  6. HOLIDAY_DIFF(date_col, m, d): Days elapsed since Month/Day.
  7. IS_WEEKEND(date_col): True if Saturday (6) or Sunday (0).

  --- New (Deliverable 1) ---
  8. Z_SCORE(val, mean, sd): Calculates standard score (how many SDs away from mean).
     Formula: (val - mean) / sd
  9. CORRELATION_MATRIX(x, y): Wrapper for Pearson correlation ensuring type safety.
  10. WEEKEND_LAG(dt): Identifies admissions susceptible to "Weekend Effect" (Fri/Sat).
      Note: dayofweek() 0=Sun, 1=Mon... 5=Fri, 6=Sat.
  11. CONSECUTIVE_OVERLOAD(v1, v2, v3, cap): Boolean check if three values ALL exceed capacity.
      Used with LEAD() window functions to find 3-day surge blocks.
  12. SHIFT_CHANGE(dt): Identifies high-risk discharge windows (6:00 PM - 8:00 PM).

  Args:
      conn (duckdb.DuckDBPyConnection): The active database connection.
  """
  try:
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

    # --- New Statistical Macros (Deliverable 1) ---

    # 8. Z-Score Calculation
    # Usage: Useful for finding statistical anomalies in length of stay.
    # Handles division by zero if standard deviation is 0.
    conn.execute(""" 
            CREATE OR REPLACE MACRO Z_SCORE(val, mu, sigma) AS 
            (val - mu) / NULLIF(sigma, 0) 
        """)

    # 9. Correlation Matrix Wrapper
    # Usage: Simplifies type casting for correlation of two columns.
    conn.execute(""" 
            CREATE OR REPLACE MACRO CORRELATION_MATRIX(x, y) AS 
            corr(CAST(x AS DOUBLE), CAST(y AS DOUBLE)) 
        """)

    # 10. Weekend Lag Indicator (Friday/Saturday Admissions)
    # DuckDB dayofweek: 0=Sunday, 1=Monday, ... 5=Friday, 6=Saturday.
    # "Weekend Effect" typically impacts patients admitted Friday (5) or Saturday (6) who wait until Monday for procedures.
    conn.execute(""" 
            CREATE OR REPLACE MACRO WEEKEND_LAG(dt) AS 
            dayofweek(dt) IN (5, 6) 
        """)

    # 11. Consecutive Overload Check
    # Usage: In a window query: SELECT CONSECUTIVE_OVERLOAD(util, LEAD(util,1) OVER(...), LEAD(util,2) OVER(...), 1.0)
    conn.execute(""" 
            CREATE OR REPLACE MACRO CONSECUTIVE_OVERLOAD(val1, val2, val3, limit_val) AS 
            (val1 > limit_val AND val2 > limit_val AND val3 > limit_val) 
        """)

    # 12. Shift Change Logic
    # Usage: Isolates timestamps occuring between 18:00 (6 PM) and 20:59 (8 PM window).
    conn.execute(""" 
            CREATE OR REPLACE MACRO SHIFT_CHANGE(dt) AS 
            hour(dt) BETWEEN 18 AND 20
        """)

    # --- UDFs (Python Bridges) ---

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
  Called by main.py during FastAPI startup event.
  """
  conn = duckdb_manager.get_connection()
  try:
    create_hospital_macros(conn)
  finally:
    conn.close()
