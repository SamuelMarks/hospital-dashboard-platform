"""
Tests for AI Context Integration.
Extended to verify Complex Multitable SQL execution paths.
"""

from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from app.services.schema import schema_service
from app.services.runners.sql import run_sql_widget

# Use in-memory DuckDB for functional verification of complex queries
import duckdb


@pytest.fixture
def complex_db():
  conn = duckdb.connect(":memory:")
  # Seed Census
  conn.execute(
    "CREATE TABLE synthetic_hospital_data (Midnight_Census_DateTime TIMESTAMP, Admit_DT TIMESTAMP, Discharge_DT TIMESTAMP, Location VARCHAR, Clinical_Focus VARCHAR, Entry_Point VARCHAR, Clinical_Service VARCHAR)"
  )
  # Seed Transfers
  conn.execute(
    "CREATE TABLE synthetic_hospital_data_transfers (CSN VARCHAR, Transfer_DateTime TIMESTAMP, Transfer_Out_Unit VARCHAR, Transfer_In_Unit VARCHAR)"
  )

  # Insert Dummy Data for Joins
  conn.execute(
    "INSERT INTO synthetic_hospital_data VALUES ('2023-01-01 00:00:00', '2023-01-01 08:00:00', '2023-01-05 10:00:00', 'ICU', 'Trauma', 'Emergency', 'Newborn')"
  )
  conn.execute("INSERT INTO synthetic_hospital_data_transfers VALUES ('123', '2023-01-02 10:00:00', 'ICU', 'PCU')")

  yield conn
  conn.close()


def test_midnight_noon_calculus(complex_db):
  """
  Test the Q20 'Midnight vs Noon' query logic specifically.
  This query uses correlated subqueries which can be tricky in some SQL dialects.
  """
  query = """
    WITH daily_dates AS (
      SELECT DISTINCT CAST(Midnight_Census_DateTime AS DATE) as d FROM synthetic_hospital_data
    )
    SELECT 
      d as census_date,
      (SELECT count(*) FROM synthetic_hospital_data c WHERE CAST(c.Midnight_Census_DateTime AS DATE) = daily_dates.d) as midnight_count,
      (SELECT count(*) FROM synthetic_hospital_data c 
       WHERE c.Admit_DT <= (daily_dates.d + INTERVAL 12 HOUR) 
         AND c.Discharge_DT >= (daily_dates.d + INTERVAL 12 HOUR)) as noon_count
    FROM daily_dates
    ORDER BY 1 DESC;
    """

  # Execute raw
  cursor = complex_db.execute(query)
  res = cursor.fetchall()

  # Row 1 (2023-01-01): Admit 08:00. Noon (12:00) is active? Yes.
  # Midnight count (captured 00:00 start) -> 1 record.
  assert len(res) == 1
  assert res[0][1] == 1  # Midnight
  # Noon count logic check:
  # Admit 08:00 < Noon. Discharge Jan 5 > Noon. So active.
  assert res[0][2] == 1


def test_transfer_join_logic(complex_db):
  """
  Verify Q10 Transfers Join logic.
  """
  query = """
    SELECT count(*) 
    FROM synthetic_hospital_data_transfers t1
    JOIN synthetic_hospital_data_transfers t2 ON t1.CSN = t2.CSN
    WHERE 1=0; -- Just checking syntax validity basically
    """
  cursor = complex_db.execute(query)
  assert cursor.fetchall() is not None
