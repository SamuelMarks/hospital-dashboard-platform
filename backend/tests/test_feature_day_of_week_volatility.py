"""
Tests for Feature #3: Day-of-Week Volatility.

Verifies the SQL logic for calculating the Standard Deviation (STDDEV)
of daily census counts to identify units with unpredictable staffing needs.
"""

import json
import os
import pytest
import duckdb
from typing import Dict, Any

# Path to the templates definition
DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")


@pytest.fixture
def volatility_template() -> Dict[str, Any]:
  """
  Loads compliance with the Day-of-Week Volatility template definition from JSON.
  """
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")

  with open(DATA_FILE, "r") as f:
    data = json.load(f)

  # Find the specific template by title
  template = next((t for t in data if t["title"] == "Day-of-Week Volatility"), None)
  if not template:
    pytest.fail("Day-of-Week Volatility template not found in initial_templates.json")
  return template


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Creates an in-memory DuckDB instance seeded with contrasting volatility patterns.
  """
  conn = duckdb.connect(":memory:")

  # Schema
  conn.execute("""
        CREATE TABLE synthetic_hospital_data (
            Location VARCHAR,
            Midnight_Census_DateTime TIMESTAMP
        )
    """)

  # --- Seeding Strategy ---

  # 1. 'Stable_Ward': Extremely predictable.
  #    10 Patients every single night for 3 days.
  #    Mean = 10, SD = 0.
  days = ["2023-01-01", "2023-01-02", "2023-01-03"]
  for day in days:
    for _ in range(10):
      conn.execute(f"INSERT INTO synthetic_hospital_data VALUES ('Stable_Ward', '{day} 23:59:00')")

  # 2. 'Volatile_Ward': High variance.
  #    Day 1: 5 Patients
  #    Day 2: 25 Patients
  #    Day 3: 5 Patients
  #    Mean ~ 11.6, SD ~ 11.5 (High)
  for _ in range(5):
    conn.execute(f"INSERT INTO synthetic_hospital_data VALUES ('Volatile_Ward', '2023-01-01 23:59:00')")
  for _ in range(25):
    conn.execute(f"INSERT INTO synthetic_hospital_data VALUES ('Volatile_Ward', '2023-01-02 23:59:00')")
  for _ in range(5):
    conn.execute(f"INSERT INTO synthetic_hospital_data VALUES ('Volatile_Ward', '2023-01-03 23:59:00')")

  # 3. 'Tiny_Ward': Too small to matter.
  #    2 patients every night. Should be filtered out by 'min_avg_census'.
  for day in days:
    for _ in range(2):
      conn.execute(f"INSERT INTO synthetic_hospital_data VALUES ('Tiny_Ward', '{day} 23:59:00')")

  yield conn
  conn.close()


def test_volatility_calculation_and_ranking(
  db_conn: duckdb.DuckDBPyConnection, volatility_template: Dict[str, Any]
) -> None:
  """
  Verify that the 'Volatile_Ward' is ranked higher than 'Stable_Ward' due to
  higher standard deviation, and that the calculated SD and CV values are correct.
  """
  raw_sql = volatility_template["sql_template"]

  # Inject min_avg_census = 5 to filter out Tiny_Ward
  sql = raw_sql.replace("{{min_avg_census}}", "5")

  print(f"\nEXECUTING SQL:\n{sql}")

  results = db_conn.execute(sql).fetchall()

  # Expected results structure: (Location, Avg, StdDev, CV)
  # Ordered by StdDev DESC

  assert len(results) == 2, "Should return 2 wards (Tiny_Ward filtered out)"

  first_place = results[0]
  second_place = results[1]

  # Check Ranking
  assert first_place[0] == "Volatile_Ward", "Volatile Ward should be ranked first"
  assert second_place[0] == "Stable_Ward", "Stable Ward should be ranked second"

  # Check Statistics (Stable Ward)
  # SD should be 0.0 because count was exactly 10 every day
  assert second_place[2] == 0.0, "Stable Ward SD should be 0"
  assert second_place[3] == 0.0, "Stable Ward CV should be 0"

  # Check Statistics (Volatile Ward)
  # SD of sample [5, 25, 5] is approx 11.547
  assert first_place[2] > 10.0, "Volatile SD should be high (>10)"


def test_volatility_filter_small_units(db_conn: duckdb.DuckDBPyConnection, volatility_template: Dict[str, Any]) -> None:
  """
  Verify that units below the average census threshold are excluded to prevent
  small N noise (e.g. going from 1 to 2 patients is 100% growth but statistically irrelevant).
  """
  raw_sql = volatility_template["sql_template"]

  # Filter avg census >= 5. 'Tiny_Ward' has avg 2.
  sql = raw_sql.replace("{{min_avg_census}}", "5")

  results = db_conn.execute(sql).fetchall()
  units = [r[0] for r in results]

  assert "Tiny_Ward" not in units, "Tiny Ward should be excluded by HAVING clause"
