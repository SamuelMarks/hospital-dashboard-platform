"""
Tests for DuckDB Statistical Macros.

Verifies that the SQL extensions defined in `duckdb_init.py` correctly implement
the required mathematical and logical rules for the 30-Question Dashboard.
Focuses on edge cases (ZeroDivision, Nulls), Temporal Logic correctness,
and Sparse Date Handling (Date Spines).
"""

from collections.abc import Generator
import datetime

import duckdb
import pytest

from app.database.duckdb_init import create_hospital_macros
from app.schemas.json_types import SqlScalar


@pytest.fixture
def db_conn() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  Provides an ephemeral in-memory DuckDB connection with all macros registered.

  Yields:
      duckdb.DuckDBPyConnection: The ready-to-test database connection.
  """
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)
  yield conn
  conn.close()


def _fetch_row(conn: duckdb.DuckDBPyConnection, query: str) -> tuple[SqlScalar, ...]:
  """
  Executes `query` on `conn` and asserts a non-None row tuple is returned.

  Args:
      conn (duckdb.DuckDBPyConnection): Active DuckDB connection.
      query (str): SQL query string.

  Returns:
      tuple[SqlScalar, ...]: First row tuple.
  """
  row = conn.execute(query).fetchone()
  assert row is not None
  return row


def test_macro_is_outlier(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Validation for Outlier Logic (`abs(val - mean) > 2*SD`)."""
  row = _fetch_row(db_conn, "SELECT IS_OUTLIER(15, 10, 2), IS_OUTLIER(11, 10, 2)")
  assert row[0] is True
  assert row[1] is False


def test_macro_z_score(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `Z_SCORE(val, mean, sd)` calculation."""
  row1 = _fetch_row(db_conn, "SELECT Z_SCORE(20, 10, 5)")
  assert row1[0] == 2.0

  row2 = _fetch_row(db_conn, "SELECT Z_SCORE(5, 10, 5)")
  assert row2[0] == -1.0

  row3 = _fetch_row(db_conn, "SELECT Z_SCORE(20, 10, 0)")
  assert row3[0] is None


def test_macro_correlation_matrix(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `CORRELATION_MATRIX(x, y)` correctly wraps Pearson correlation aggregation."""
  db_conn.execute("CREATE TABLE corr_test (a INTEGER, b INTEGER)")
  db_conn.execute("INSERT INTO corr_test VALUES (1, 2), (2, 4), (3, 6)")

  row = _fetch_row(db_conn, "SELECT CORRELATION_MATRIX(a, b) FROM corr_test")
  val = row[0]
  assert isinstance(val, (int, float))
  assert abs(float(val) - 1.0) < 0.0001


def test_macro_weekend_lag(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `WEEKEND_LAG(dt)` correctly identifies Fridays (5) and Saturdays (6)."""
  assert _fetch_row(db_conn, "SELECT WEEKEND_LAG('2023-01-06'::DATE)")[0] is True
  assert _fetch_row(db_conn, "SELECT WEEKEND_LAG('2023-01-07'::DATE)")[0] is True
  assert _fetch_row(db_conn, "SELECT WEEKEND_LAG('2023-01-01'::DATE)")[0] is False


def test_macro_consecutive_overload(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `CONSECUTIVE_OVERLOAD` logic is TRUE only if all three values > limit."""
  limit = 100
  assert _fetch_row(db_conn, f"SELECT CONSECUTIVE_OVERLOAD(101, 102, 103, {limit})")[0] is True
  assert _fetch_row(db_conn, f"SELECT CONSECUTIVE_OVERLOAD(101, 99, 103, {limit})")[0] is False


def test_macro_shift_change(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `SHIFT_CHANGE(dt, start, end)` correctly targets specified time windows."""
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 17:59:00'::TIMESTAMP, 18, 20)")[0] is False
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 18:00:00'::TIMESTAMP, 18, 20)")[0] is True
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 20:59:59'::TIMESTAMP, 18, 20)")[0] is True
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 21:00:00'::TIMESTAMP, 18, 20)")[0] is False

  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 06:30:00'::TIMESTAMP, 7, 9)")[0] is False
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 07:15:00'::TIMESTAMP, 7, 9)")[0] is True
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 09:45:00'::TIMESTAMP, 7, 9)")[0] is True
  assert _fetch_row(db_conn, "SELECT SHIFT_CHANGE('2023-01-01 10:00:00'::TIMESTAMP, 7, 9)")[0] is False


def test_macro_generate_dates(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `GENERATE_DATES` table macro produces a contiguous range of dates."""
  start = "2023-01-01"
  end = "2023-01-03"

  query = f"SELECT * FROM GENERATE_DATES('{start}', '{end}') ORDER BY spine_date"
  results = db_conn.execute(query).fetchall()

  assert len(results) == 3
  d1 = results[0][0]
  assert isinstance(d1, datetime.datetime)
  assert d1.year == 2023
  assert d1.month == 1
  assert d1.day == 1


def test_macro_bed_turnover_events(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verifies `BED_TURNOVER_EVENTS` deduplicates daily census snapshots and pairs each discharge with the next admit."""
  db_conn.execute("""
    CREATE TABLE synthetic_hospital_data (
      PiCSN VARCHAR,
      Location VARCHAR,
      Clinical_Service VARCHAR,
      Midnight_Census_DateTime TIMESTAMP,
      Admit_DT TIMESTAMP,
      Discharge_DT TIMESTAMP
    )
  """)
  # Patient 1 stays 2 days (2 daily census rows), discharged at 2026-01-03 10:00:00
  # Patient 2 was already admitted earlier (2026-01-02 08:00:00) and discharged 2026-01-04 12:00:00
  # Patient 3 is admitted after Patient 1's discharge at 2026-01-03 11:30:00 (90 min turnover)
  db_conn.execute("""
    INSERT INTO synthetic_hospital_data VALUES
      ('CSN-1', 'ICU_Cardiology_B', 'Cardiology', '2026-01-01 23:59:00', '2026-01-01 09:00:00', '2026-01-03 10:00:00'),
      ('CSN-1', 'ICU_Cardiology_B', 'Cardiology', '2026-01-02 23:59:00', '2026-01-01 09:00:00', '2026-01-03 10:00:00'),
      ('CSN-2', 'ICU_Cardiology_B', 'Cardiology', '2026-01-02 23:59:00', '2026-01-02 08:00:00', '2026-01-04 12:00:00'),
      ('CSN-3', 'ICU_Cardiology_B', 'Cardiology', '2026-01-03 23:59:00', '2026-01-03 11:30:00', '2026-01-05 14:00:00')
  """)
  create_hospital_macros(db_conn)
  rows = db_conn.execute("SELECT Location, turnover_minutes FROM BED_TURNOVER_EVENTS(24)").fetchall()
  assert len(rows) == 1
  assert rows[0][0] == "ICU_Cardiology_B"
  assert rows[0][1] == 90
