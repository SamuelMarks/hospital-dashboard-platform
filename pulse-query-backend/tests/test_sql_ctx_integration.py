"""
Tests for AI Context Integration.
Extended to verify Complex Multitable SQL execution paths.
"""

from collections.abc import Generator

import duckdb
import pytest


@pytest.fixture
def complex_db() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  Creates an in-memory DuckDB instance seeded with census and multi-hop transfer records.

  Yields:
      duckdb.DuckDBPyConnection: Seeded in-memory DuckDB connection.
  """
  conn = duckdb.connect(":memory:")
  conn.execute(
    "CREATE TABLE synthetic_hospital_data ("
    "Midnight_Census_DateTime TIMESTAMP, Admit_DT TIMESTAMP, Discharge_DT TIMESTAMP, "
    "Location VARCHAR, Clinical_Focus VARCHAR, Entry_Point VARCHAR, Clinical_Service VARCHAR)"
  )
  conn.execute(
    "CREATE TABLE synthetic_hospital_data_transfers ("
    "CSN VARCHAR, Transfer_DateTime TIMESTAMP, Transfer_Out_Unit VARCHAR, Transfer_In_Unit VARCHAR)"
  )

  conn.execute(
    "INSERT INTO synthetic_hospital_data VALUES ("
    "'2023-01-01 00:00:00', '2023-01-01 08:00:00', '2023-01-05 10:00:00', "
    "'ICU', 'Trauma', 'Emergency', 'Newborn')"
  )
  conn.execute("INSERT INTO synthetic_hospital_data_transfers VALUES ('123', '2023-01-02 10:00:00', 'ICU', 'PCU')")
  conn.execute("INSERT INTO synthetic_hospital_data_transfers VALUES ('123', '2023-01-03 14:00:00', 'PCU', 'Ward_A')")
  conn.execute("INSERT INTO synthetic_hospital_data_transfers VALUES ('999', '2023-01-02 09:00:00', 'ER', 'ICU')")

  yield conn
  conn.close()


def test_midnight_noon_calculus(complex_db: duckdb.DuckDBPyConnection) -> None:
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

  cursor = complex_db.execute(query)
  res = cursor.fetchall()

  assert len(res) == 1
  assert res[0][1] == 1
  assert res[0][2] == 1


def test_transfer_join_logic(complex_db: duckdb.DuckDBPyConnection) -> None:
  """
  Verifies Q10 multi-hop unit transfer self-join logic matching sequential transfers on CSN.
  """
  query = """
    SELECT
      t1.CSN,
      t1.Transfer_Out_Unit AS origin_unit,
      t1.Transfer_In_Unit AS intermediate_unit,
      t2.Transfer_In_Unit AS destination_unit
    FROM synthetic_hospital_data_transfers t1
    JOIN synthetic_hospital_data_transfers t2
      ON t1.CSN = t2.CSN
     AND t1.Transfer_In_Unit = t2.Transfer_Out_Unit
     AND t1.Transfer_DateTime < t2.Transfer_DateTime;
    """
  cursor = complex_db.execute(query)
  rows = cursor.fetchall()
  assert rows == [("123", "ICU", "PCU", "Ward_A")]
