"""
Tests for Feature #8: Admission Lag.

Verifies the SQL logic for calculating the lag time between ER Admission and
the *First* appearance in the Census. Ensures that long-stay patients
(who appear in multiple daily snapshots) do not skew the average lag calculation.
"""

import json
import os
import pytest
import duckdb
from typing import Dict, Any

# Path to the templates definition
DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")


@pytest.fixture
def admission_lag_template() -> Dict[str, Any]:
  """
  Loads compliance with the Admission Lag template definition from JSON.
  """
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")

  with open(DATA_FILE, "r") as f:
    data = json.load(f)

  # Find the specific template by title
  template = next((t for t in data if t["title"] == "Admission Lag"), None)
  if not template:
    pytest.fail("Admission Lag template not found in initial_templates.json")
  return template


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Creates an in-memory DuckDB instance seeded with a pattern specifically
  designed to test the 'First Appearance' logic.
  """
  conn = duckdb.connect(":memory:")

  # Schema based on standardized columns (updated from Clinical_Focus to Clinical_Service)
  conn.execute("""
        CREATE TABLE synthetic_hospital_data (
            Visit_ID VARCHAR,
            Clinical_Service VARCHAR,
            Admit_DT TIMESTAMP,
            Midnight_Census_DateTime TIMESTAMP,
            Entry_Point VARCHAR
        )
    """)

  # --- Seeding Strategy ---
  # Patient 'P1': Admitted Jan 1 at 10:00 AM (ER).
  # Census 1: Jan 1 23:59. DateDiff Hour (23-10) = 13.
  # Census 2: Jan 2 23:59. (Ignored by First Appearance Logic)
  # Census 3: Jan 3 23:59. (Ignored)

  admit_time = "2023-01-01 10:00:00"

  # Census 1
  conn.execute(f"""
        INSERT INTO synthetic_hospital_data VALUES
        ('P1', 'Trauma', '{admit_time}', '2023-01-01 23:59:00', 'Emergency Room')
    """)
  # Census 2
  conn.execute(f"""
        INSERT INTO synthetic_hospital_data VALUES
        ('P1', 'Trauma', '{admit_time}', '2023-01-02 23:59:00', 'Emergency Room')
    """)
  # Census 3
  conn.execute(f"""
        INSERT INTO synthetic_hospital_data VALUES
        ('P1', 'Trauma', '{admit_time}', '2023-01-03 23:59:00', 'Emergency Room')
    """)

  # Patient 'P2': Short stay. Admitted Jan 2 12:00.
  # Census 1: Jan 2 23:59. Lag = 23-12 = 11 hours.
  conn.execute("""
        INSERT INTO synthetic_hospital_data VALUES
        ('P2', 'Trauma', '2023-01-02 12:00:00', '2023-01-02 23:59:00', 'Emergency Room')
    """)

  yield conn
  conn.close()


def test_admission_lag_first_appearance_logic(
  db_conn: duckdb.DuckDBPyConnection, admission_lag_template: Dict[str, Any]
) -> None:
  """
  Verifies that the SQL aggregates by Visit_ID to find the first census event
  before calculating the average lag.
  """
  sql = admission_lag_template["sql_template"]

  print(f"\nEXECUTING SQL:\n{sql}")

  results = db_conn.execute(sql).fetchall()

  # Expected calculation:
  # P1 First Lag: 13 hours (23:59 - 10:00 on Jan 1) -> date_diff('hour') = 13
  # P2 First Lag: 11 hours (23:59 - 12:00 on Jan 2) -> date_diff('hour') = 11
  # Average: (13 + 11) / 2 = 12 hours.

  assert len(results) == 1, "Should return one row for 'Trauma' service"

  row = results[0]
  # Clinical_Service is the first column in the template SELECT
  service = row[0]
  avg_lag = row[1]

  assert service == "Trauma"

  # Updated expectation to match DuckDB date_diff hour truncation behavior
  assert abs(avg_lag - 12.0) < 0.1, (
    f"Expected 12.0 hours, got {avg_lag}. Logic might be averaging multiple census rows per patient."
  )
