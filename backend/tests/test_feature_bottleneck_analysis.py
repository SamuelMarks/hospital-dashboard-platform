"""
Tests for Feature #2: Bottleneck Analysis.

Verifies the SQL logic for identifying hours of day where admissions significantly
outpace discharges for specific clinical services.
"""

import json
import os
import pytest
import duckdb
from typing import Dict, Any
from app.database.duckdb_init import create_hospital_macros  # Fixed import

# Path to the templates definition
DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")


@pytest.fixture
def bottleneck_template() -> Dict[str, Any]:
  """
  Loads compliance with the Bottleneck Analysis template definition from JSON.
  """
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")

  with open(DATA_FILE, "r") as f:
    data = json.load(f)

  # Find the specific template by title
  template = next((t for t in data if t["title"] == "Bottleneck Analysis"), None)
  if not template:
    pytest.fail("Bottleneck Analysis template not found in initial_templates.json")
  return template


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Creates an in-memory DuckDB instance seeded with specific flow patterns
  to test bottleneck logic.
  """
  conn = duckdb.connect(":memory:")

  # Register Macros (Fix for failures)
  create_hospital_macros(conn)

  # Schema
  conn.execute(""" 
        CREATE TABLE synthetic_hospital_data ( 
            Clinical_Service VARCHAR, 
            Admit_DT TIMESTAMP, 
            Discharge_DT TIMESTAMP
        ) 
    """)

  # --- Seeding Strategy ---

  # Scenario A: Cardiology - Massive Morning Influx (Bottleneck)
  # Hour 8: 10 Admissions, 2 Discharges. Net = +8 (Bottleneck)
  for _ in range(10):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('Cardiology', '2023-01-01 08:30:00', NULL)")
  for _ in range(2):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('Cardiology', NULL, '2023-01-01 08:45:00')")  # Discharge

  # Scenario B: Neurology - High Discharge Rate (Flowing Well)
  # Hour 8: 3 Admissions, 8 Discharges. Net = -5 (Not a bottleneck)
  for _ in range(3):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('Neurology', '2023-01-01 08:30:00', NULL)")
  for _ in range(8):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('Neurology', NULL, '2023-01-01 08:45:00')")

  # Scenario C: Orthopedics - Neutral (1:1)
  # Hour 14: 5 Admissions, 5 Discharges. Net = 0 (Not a bottleneck if threshold > 0)
  for _ in range(5):
    conn.execute(
      "INSERT INTO synthetic_hospital_data VALUES ('Orthopedics', '2023-01-01 14:00:00', '2023-01-05 14:30:00')"
    )

  yield conn
  conn.close()


# ... Tests remain unchanged ...
def test_bottleneck_detection_logic(db_conn: duckdb.DuckDBPyConnection, bottleneck_template: Dict[str, Any]) -> None:
  """
  Validates that the SQL query correctly identifies Service A (High Net Influx)
  and excludes Service B (Net Outflow).
  """
  raw_sql = bottleneck_template["sql_template"]

  # Inject Parameters: Threshold > 0
  sql = raw_sql.replace("{{min_threshold}}", "0")

  print(f"\nEXECUTING SQL:\n{sql}")

  results = db_conn.execute(sql).fetchall()

  # Expected:
  # Row 1: Cardiology, Hour 8, Admits 10, Discharges 2, Net 8
  # Orthopedics (Net 0) should be excluded because of WHERE > 0
  # Neurology (Net -5) should be excluded

  assert len(results) >= 1, "Should find at least one bottleneck"

  top_row = results[0]
  service, hour, admits, discharges, net = top_row

  assert service == "Cardiology"
  assert hour == 8
  assert admits == 10
  assert discharges == 2
  assert net == 8


def test_bottleneck_threshold_filtering(db_conn: duckdb.DuckDBPyConnection, bottleneck_template: Dict[str, Any]) -> None:
  """
  Verify that increasing the threshold filters out minor/neutral flows.
  """
  raw_sql = bottleneck_template["sql_template"]

  # Inject High Threshold: 5
  # Cardiology (8) > 5 -> Should Show
  # Orthopedics (0) < 5 -> Exclude
  sql = raw_sql.replace("{{min_threshold}}", "5")

  results = db_conn.execute(sql).fetchall()

  services = [row[0] for row in results]
  assert "Cardiology" in services
  assert "Orthopedics" not in services
  assert "Neurology" not in services


def test_bottleneck_full_join_safety(db_conn: duckdb.DuckDBPyConnection, bottleneck_template: Dict[str, Any]) -> None:
  """
  Verify FULL OUTER JOIN handles hours with NO admissions but existing discharges,
  and hours with NO discharges but existing admissions.
  """
  # Create specific edge case data
  conn = duckdb.connect(":memory:")
  # Register macros for this temp connection as well
  create_hospital_macros(conn)

  conn.execute(
    "CREATE TABLE synthetic_hospital_data (Clinical_Service VARCHAR, Admit_DT TIMESTAMP, Discharge_DT TIMESTAMP)"
  )

  # Service 'InboundOnly': 5 Admits at 9AM, 0 Discharges. Net +5.
  conn.execute("INSERT INTO synthetic_hospital_data VALUES ('InboundOnly', '2023-01-01 09:00:00', NULL)")

  # Service 'OutboundOnly': 0 Admits at 9AM, 5 Discharges. Net -5.
  conn.execute("INSERT INTO synthetic_hospital_data VALUES ('OutboundOnly', NULL, '2023-01-01 09:00:00')")

  raw_sql = bottleneck_template["sql_template"]

  # Check Net > -10 (Should allow negative output for verification of join)
  sql = raw_sql.replace("{{min_threshold}}", "-10")

  results = conn.execute(sql).fetchall()
  conn.close()

  data_map = {r[0]: r[4] for r in results}  # Service -> Net

  # InboundOnly should exist (COALESCE works on admit side)
  assert "InboundOnly" in data_map
  assert data_map["InboundOnly"] == 1  # 1 row insert = 1 admit count

  # OutboundOnly should exist (COALESCE works on discharge side)
  assert "OutboundOnly" in data_map
  assert data_map["OutboundOnly"] == -1
