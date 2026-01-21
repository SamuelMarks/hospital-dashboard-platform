"""
Tests for Feature #8: Admission Lag.

Verifies the SQL logic for calculating the lag time between ER Admission and
the *First* appearance in the Census.
"""

import json
import os
import pytest
import duckdb
from typing import Dict, Any

DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")


@pytest.fixture
def admission_lag_template() -> Dict[str, Any]:
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")
  with open(DATA_FILE, "r") as f:
    data = json.load(f)
  return next((t for t in data if t["title"] == "Admission Lag"), None)


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  conn = duckdb.connect(":memory:")

  # ADDED: Visit_Type column required by SQL template
  conn.execute(""" 
        CREATE TABLE synthetic_hospital_data ( 
            Visit_ID VARCHAR, 
            Visit_Type VARCHAR,
            Clinical_Service VARCHAR, 
            Admit_DT TIMESTAMP, 
            Midnight_Census_DateTime TIMESTAMP, 
            Entry_Point VARCHAR
        ) 
    """)

  admit_time = "2023-01-01 10:00:00"

  # Census 1
  conn.execute(f""" 
        INSERT INTO synthetic_hospital_data VALUES
        ('P1', 'Inpatient', 'Trauma', '{admit_time}', '2023-01-01 23:59:00', 'Emergency Room') 
    """)
  # Census 2
  conn.execute(f""" 
        INSERT INTO synthetic_hospital_data VALUES
        ('P1', 'Inpatient', 'Trauma', '{admit_time}', '2023-01-02 23:59:00', 'Emergency Room') 
    """)
  # Patient P2
  conn.execute(""" 
        INSERT INTO synthetic_hospital_data VALUES
        ('P2', 'Inpatient', 'Trauma', '2023-01-02 12:00:00', '2023-01-02 23:59:00', 'Emergency Room') 
    """)

  yield conn
  conn.close()


def test_admission_lag_first_appearance_logic(
  db_conn: duckdb.DuckDBPyConnection, admission_lag_template: Dict[str, Any]
) -> None:
  """
  Verifies that the SQL aggregates by Visit_ID to find the first census event.
  """
  sql = admission_lag_template["sql_template"]
  results = db_conn.execute(sql).fetchall()

  assert len(results) == 1
  row = results[0]
  service = row[0]
  avg_lag = row[1]

  assert service == "Trauma"
  # P1 Lag: 13h, P2 Lag: 11h -> Avg 12h
  assert abs(avg_lag - 12.0) < 0.1
