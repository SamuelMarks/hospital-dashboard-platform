"""
Tests for DuckDB Statistical Macros.

Verifies that the SQL extensions defined in `duckdb_init.py` correctly implement
the required mathematical and logical rules for the 30-Question Dashboard.
Focuses on edge cases (ZeroDivision, Nulls), Temporal Logic correctness,
and Sparse Date Handling (Date Spines).
"""

import pytest
import duckdb
import datetime
from app.database.duckdb_init import create_hospital_macros


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Provides an ephemeral in-memory DuckDB connection with all macros registered.

  Returns:
      duckdb.DuckDBPyConnection: The ready-to-test database connection.
  """
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)
  yield conn
  conn.close()


# --- Existing Macro Tests (Regression Check) ---


def test_macro_is_outlier(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Validation for Outlier Logic.
  Logic: abs(val - mean) > 2*SD
  """
  # Mean 10, SD 2. Range [6, 14].
  # 15 is Outlier (5 diff > 4). 11 is Not (1 diff < 4).
  query = "SELECT IS_OUTLIER(15, 10, 2), IS_OUTLIER(11, 10, 2)"
  row = db_conn.execute(query).fetchone()
  assert row[0] is True
  assert row[1] is False


def test_macro_z_score(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies Z_SCORE(val, mean, sd) calculation.
  Formula: (x - u) / o
  """
  # Case 1: Standard
  # Val 20, Mean 10, SD 5. Result = (20-10)/5 = 2.0
  row1 = db_conn.execute("SELECT Z_SCORE(20, 10, 5)").fetchone()
  assert row1[0] == 2.0

  # Case 2: Negative Z
  # Val 5, Mean 10, SD 5. Result = (5-10)/5 = -1.0
  row2 = db_conn.execute("SELECT Z_SCORE(5, 10, 5)").fetchone()
  assert row2[0] == -1.0

  # Case 3: Division by Zero Safety
  # SD = 0. Should return NULL, not crash.
  row3 = db_conn.execute("SELECT Z_SCORE(20, 10, 0)").fetchone()
  assert row3[0] is None


def test_macro_correlation_matrix(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies CORRELATION_MATRIX(x, y) correctly wraps aggregation.
  Calculates Pearson correlation coefficient.
  """
  # Setup: Create a table with perfect positive correlation
  db_conn.execute("CREATE TABLE corr_test (a INTEGER, b INTEGER)")
  db_conn.execute("INSERT INTO corr_test VALUES (1, 2), (2, 4), (3, 6)")

  # Expectation: 1.0 (Perfect linear relationship)
  row = db_conn.execute("SELECT CORRELATION_MATRIX(a, b) FROM corr_test").fetchone()

  # Floating point comparison safety
  assert abs(row[0] - 1.0) < 0.0001


def test_macro_weekend_lag(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies WEEKEND_LAG(dt) correctly identifies Fridays (5) and Saturdays (6).
  """
  # 2023-01-06 was a Friday (5).
  # 2023-01-07 was a Saturday (6).
  # 2023-01-01 was a Sunday (0).

  # Test Friday (Admit Date)
  res_fri = db_conn.execute("SELECT WEEKEND_LAG('2023-01-06'::DATE)").fetchone()[0]
  assert res_fri is True

  # Test Saturday
  res_sat = db_conn.execute("SELECT WEEKEND_LAG('2023-01-07'::DATE)").fetchone()[0]
  assert res_sat is True

  # Test Sunday
  res_sun = db_conn.execute("SELECT WEEKEND_LAG('2023-01-01'::DATE)").fetchone()[0]
  assert res_sun is False


def test_macro_consecutive_overload(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies CONSECUTIVE_OVERLOAD logic.
  Must be TRUE only if ALL three values > limit.
  """
  limit = 100
  # Case 1: All Above -> TRUE
  assert db_conn.execute(f"SELECT CONSECUTIVE_OVERLOAD(101, 102, 103, {limit})").fetchone()[0] is True
  # Case 2: One Dip -> FALSE
  assert db_conn.execute(f"SELECT CONSECUTIVE_OVERLOAD(101, 99, 103, {limit})").fetchone()[0] is False


# --- Dynamic Shift Awareness Tests ---


def test_macro_shift_change(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies SHIFT_CHANGE(dt, start, end) correctly targets specified time windows.
  We test both the "Standard Nursing" shift (7a-7p) and "Evening Handoff" (6p-8p).
  """
  # Scenario 1: Standard Evening Handoff (18:00 - 20:00)
  # 17:59 (5:59 PM) -> False
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 17:59:00'::TIMESTAMP, 18, 20)").fetchone()[0] is False
  # 18:00 (6:00 PM) -> True
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 18:00:00'::TIMESTAMP, 18, 20)").fetchone()[0] is True
  # 20:59 (8:59 PM) -> True (Same hour as 20)
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 20:59:59'::TIMESTAMP, 18, 20)").fetchone()[0] is True
  # 21:00 (9:00 PM) -> False
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 21:00:00'::TIMESTAMP, 18, 20)").fetchone()[0] is False

  # Scenario 2: Morning Shift Handoff (07:00 - 09:00)
  # 06:30 -> False
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 06:30:00'::TIMESTAMP, 7, 9)").fetchone()[0] is False
  # 07:15 -> True
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 07:15:00'::TIMESTAMP, 7, 9)").fetchone()[0] is True
  # 09:45 -> True
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 09:45:00'::TIMESTAMP, 7, 9)").fetchone()[0] is True
  # 10:00 -> False
  assert db_conn.execute("SELECT SHIFT_CHANGE('2023-01-01 10:00:00'::TIMESTAMP, 7, 9)").fetchone()[0] is False


# --- Sparse Date Handling Tests ---


def test_macro_generate_dates(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies GENERATE_DATES table macro produces a contiguous range of dates.
  """
  start = "2023-01-01"
  end = "2023-01-03"

  query = f"SELECT * FROM GENERATE_DATES('{start}', '{end}') ORDER BY spine_date"
  results = db_conn.execute(query).fetchall()

  assert len(results) == 3  # 01, 02, 03
  d1 = results[0][0]
  assert isinstance(d1, datetime.datetime)
  assert d1.year == 2023
  assert d1.month == 1
  assert d1.day == 1
