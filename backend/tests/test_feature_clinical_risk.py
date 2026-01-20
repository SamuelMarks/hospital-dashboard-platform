"""
Tests for Clinical Risk Analytics (Themes 21 & 28).

Targeted verification for:
1. **Conditional Overstay Risk** (Theme 21): Validates the conditional probability
   logic determining if a patient already at stay height X will exceed Y.
2. **The 'NICU Cliff'** (Theme 28): Validates the probability cliff where newborns
   exceeding 48h stay are likely to become Long Stay patients.

This test suite mocks the data layer by creating temporary DuckDB tables and
calculating results using the SQL templates defined in the system.
"""

import json
import os
import pytest
import duckdb
from typing import Dict, Any, List
from app.database.duckdb_init import create_hospital_macros

# Path to the templates definition file
DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")


@pytest.fixture
def templates() -> List[Dict[str, Any]]:
  """
  Loads the template registry from the JSON file.

  Returns:
      List[Dict[str, Any]]: The full list of template definitions.
  """
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Templates file not found at {DATA_FILE}")

  with open(DATA_FILE, "r") as f:
    return json.load(f)


@pytest.fixture
def clinical_db() -> duckdb.DuckDBPyConnection:
  """
  Creates a transient in-memory DuckDB instance seeded with clinical test data.
  Pre-registers statistical macros (PROBABILITY, IS_OUTLIER) required by the templates.

  Returns:
      duckdb.DuckDBPyConnection: The active database connection.
  """
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)

  # Schema required for both templates
  conn.execute(""" 
        CREATE TABLE synthetic_hospital_data ( 
            Location VARCHAR, 
            Clinical_Service VARCHAR, 
            Admit_DT TIMESTAMP, 
            Discharge_DT TIMESTAMP 
        ) 
    """)
  return conn


def test_conditional_overstay_risk_logic(clinical_db: duckdb.DuckDBPyConnection, templates: List[Dict[str, Any]]) -> None:
  """
  Verifies Theme 21: Conditional Overstay Risk.

  Scenario Logic:
  - We want P(LoS >= target | LoS >= current).
  - Parameters: current_days=4, target_days=7.
  - Population: Patients in 'Cardiology'.

  Seeding:
  1. Patient A: LoS 2 days (Excluded from denominator).
  2. Patient B: LoS 5 days (Included in Denom, Excluded from Numerator).
  3. Patient C: LoS 8 days (Included in Denom, Included in Numerator).

  Expected Result:
  - Denominator (>= 4 days): Patients B and C = 2.
  - Numerator (>= 7 days): Patient C = 1.
  - Probability: 1/2 = 50%.

  Args:
      clinical_db: Database connection.
      templates: Loaded templates list.
  """
  # 1. Seed Data
  # Patient A (2 days)
  clinical_db.execute("INSERT INTO synthetic_hospital_data VALUES ('Cardiology', 'Gen', '2023-01-01', '2023-01-03')")
  # Patient B (5 days)
  clinical_db.execute("INSERT INTO synthetic_hospital_data VALUES ('Cardiology', 'Gen', '2023-01-01', '2023-01-06')")
  # Patient C (8 days)
  clinical_db.execute("INSERT INTO synthetic_hospital_data VALUES ('Cardiology', 'Gen', '2023-01-01', '2023-01-09')")

  # 2. Get Template
  template = next((t for t in templates if t["title"] == "Conditional Overstay Risk"), None)
  assert template is not None, "Template 21 missing"

  raw_sql = template["sql_template"]

  # 3. Inject Parameters
  sql = raw_sql.replace("{{unit_pattern}}", "Cardiology").replace("{{current_days}}", "4").replace("{{target_days}}", "7")

  # 4. Execute
  result = clinical_db.execute(sql).fetchone()
  percentage = result[0]

  # 5. Assert
  assert percentage == 50.0, f"Expected 50% probability, got {percentage}"


def test_nicu_cliff_logic(clinical_db: duckdb.DuckDBPyConnection, templates: List[Dict[str, Any]]) -> None:
  """
  Verifies Theme 28: The 'NICU Cliff'.

  Scenario Logic:
  - We want P(Long Stay > 10d | Stay > 48h).
  - Population: Clinical_Service = 'Newborn'.

  Seeding:
  1. Baby A: Stay 24 hours. (Filtered out entirely by WHERE clause).
  2. Baby B: Stay 50 hours (~2 days). (Denominator, Not Numerator).
  3. Baby C: Stay 300 hours (>12 days). (Denominator, Numerator).

  Expected Result:
  - Denominator (Hours > 48): Babies B and C = 2.
  - Numerator (Days > 10): Baby C = 1 (300h approx 12.5 days).
  - Probability: 1/2 = 50%.

  Args:
      clinical_db: Database connection.
      templates: Loaded templates list.
  """
  # 1. Seed Data
  # Baby A (24h)
  clinical_db.execute(
    "INSERT INTO synthetic_hospital_data VALUES ('Nursery', 'Newborn', '2023-01-01 00:00:00', '2023-01-02 00:00:00')"
  )
  # Baby B (50h)
  clinical_db.execute(
    "INSERT INTO synthetic_hospital_data VALUES ('Nursery', 'Newborn', '2023-01-01 00:00:00', '2023-01-03 02:00:00')"
  )
  # Baby C (300h = 12.5 days)
  clinical_db.execute(
    "INSERT INTO synthetic_hospital_data VALUES ('Nursery', 'Newborn', '2023-01-01 00:00:00', '2023-01-13 12:00:00')"
  )

  # 2. Get Template
  template = next((t for t in templates if t["title"] == "The 'NICU Cliff'"), None)
  assert template is not None, "Template 28 missing"

  sql = template["sql_template"]

  # 3. Execute (No handlebars in this template)
  result = clinical_db.execute(sql).fetchone()
  percentage = result[0]

  # 4. Assert
  assert percentage == 50.0, f"Expected 50% probability, got {percentage}"
