"""
Tests for Feature #1: Predictive Availability.

Verifies the SQL logic for calculating the probability of future bed availability
based on current utilization conditions using a self-join pattern.
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
def predictive_template() -> Dict[str, Any]:
  """
  Loads compliance with the new template definition from JSON.
  """
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")

  with open(DATA_FILE, "r") as f:
    data = json.load(f)

  # Find the specific template by title
  template = next((t for t in data if t["title"] == "Predictive Availability"), None)
  if not template:
    pytest.fail("Predictive Availability template not found in initial_templates.json")
  return template


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Creates an in-memory DuckDB instance seeded with a pattern specifically
  designed to test the conditional probability logic.
  """
  conn = duckdb.connect(":memory:")

  # Register Macros (Fix for failures)
  create_hospital_macros(conn)

  # Schema: Just enough columns for the query
  conn.execute(""" 
        CREATE TABLE synthetic_hospital_data ( 
            Location VARCHAR, 
            Midnight_Census_DateTime TIMESTAMP
        ) 
    """)

  # --- Seeding Strategy ---
  # Target Ward: 'ICU_A'
  # Capacity: 10
  # Threshold: > 90% (i.e. > 9 patients) -> Condition requires 10 patients
  # Target Available: >= 2 beds (i.e. <= 8 patients)

  # 1. Condition Day (Thursday): 2023-01-05. Load = 10 (Full, >90%). Meet Condition.
  #    Outcome Day (Sunday): 2023-01-08. Load = 5 (5 Avail >= 2). Success.
  for _ in range(10):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-05 23:59:00')")
  for _ in range(5):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-08 23:59:00')")

  # 2. Condition Day (Thursday): 2023-01-12. Load = 10. Meet Condition.
  #    Outcome Day (Sunday): 2023-01-15. Load = 9 (1 Avail < 2). Failure.
  for _ in range(10):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-12 23:59:00')")
  for _ in range(9):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-15 23:59:00')")

  # 3. Condition Day (Thursday): 2023-01-19. Load = 5. (5/10 = 0.5 < 0.9). Fail Condition.
  #    Outcome Day (Sunday): 2023-01-22. Load = 5.
  #    This pair should be IGNORED because Thursday load didn't meet threshold.
  for _ in range(5):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-19 23:59:00')")
  for _ in range(5):
    conn.execute("INSERT INTO synthetic_hospital_data VALUES ('ICU_A', '2023-01-22 23:59:00')")

  # Summary:
  # Total Condition Days Met: 2 (Jan 5, Jan 12)
  # Total Successes (Sunday has >= 2 beds): 1 (Jan 8)
  # Expected Probability: 1 / 2 = 50%

  yield conn
  conn.close()


# ... Tests remain unchanged ...
def test_predictive_availability_logic(db_conn: duckdb.DuckDBPyConnection, predictive_template: Dict[str, Any]) -> None:
  """
  Injects parameters into the SQL template and verifies the statistical output.
  """
  raw_sql = predictive_template["sql_template"]

  # Inject Parameters matching the Seeding Strategy
  # Ward: ICU
  # Start DOW: 4 (Thursday)
  # Gap: 3 days (Thu -> Sun)
  # Capacity: 10
  # Threshold: 0.9
  # Target Beds: 2

  sql = (
    raw_sql.replace("{{target_ward}}", "ICU")
    .replace("{{start_dow}}", "4")
    .replace("{{days_gap}}", "3")
    .replace("{{capacity}}", "10")
    .replace("{{util_threshold}}", "0.9")
    .replace("{{target_beds}}", "2")
  )

  print(f"\nEXECUTING SQL:\n{sql}")

  result = db_conn.execute(sql).fetchone()

  prob_pct = result[0]
  sample_size = result[1]

  assert sample_size == 2, "Should identify exactly 2 Thursdays meeting utilization > 90%"
  assert prob_pct == 50.0, "Probability should be 50% (1 success out of 2 valid conditions)"


def test_predictive_no_data_safety(db_conn: duckdb.DuckDBPyConnection, predictive_template: Dict[str, Any]) -> None:
  """
  Ensure the query handles cases where NO days meet the condition (divide by zero protection).
  """
  raw_sql = predictive_template["sql_template"]

  # Threshold 1.1 (Impossible)
  sql = (
    raw_sql.replace("{{target_ward}}", "ICU")
    .replace("{{start_dow}}", "4")
    .replace("{{days_gap}}", "3")
    .replace("{{capacity}}", "10")
    .replace("{{util_threshold}}", "1.1")
    .replace("{{target_beds}}", "2")
  )

  result = db_conn.execute(sql).fetchone()

  prob_pct = result[0]
  sample_size = result[1]

  assert sample_size == 0
  assert prob_pct == 0.0  # COALESCE / NULLIF handling check
