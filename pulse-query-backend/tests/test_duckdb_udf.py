"""
Tests for DuckDB User Defined Functions (UDFs) and Bed-Use Census Macros.

Verifies that `OPTIMIZE_SERVICE_UNIT_BEDS` and the four census macros
(`CENSUS_PATIENT_DAYS_BY_UNIT`, `CENSUS_PATIENT_DAYS_BY_SERVICE`,
`CENSUS_COMBINED_BREAKDOWN`, `CENSUS_SUMMARY_STATISTICS`) are registered
and callable via standard SQL queries.
"""

from collections.abc import Generator
import json

import duckdb
import pytest

from app.database.duckdb_init import create_hospital_macros
from app.services.optimization.service_unit_solver import optimize_service_unit_beds_udf


@pytest.fixture
def db_conn() -> Generator[duckdb.DuckDBPyConnection, None, None]:
  """
  Fixture providing an in-memory DuckDB connection populated with registered macros and UDFs.

  Yields:
      duckdb.DuckDBPyConnection: Active in-memory DuckDB connection.
  """
  conn = duckdb.connect(":memory:")
  conn.execute(
    "CREATE TABLE synthetic_hospital_data (Location VARCHAR, Clinical_Service VARCHAR);"
    "INSERT INTO synthetic_hospital_data VALUES ('PCU 350', 'General Pediatrics'), ('PICU', 'Neurosurgery');"
  )
  create_hospital_macros(conn)
  yield conn
  conn.close()


def test_optimize_service_unit_beds_udf_execution(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Test calling the `OPTIMIZE_SERVICE_UNIT_BEDS` UDF via SQL."""
  constraints = json.dumps(
    [{"constraint_type": "unit_capacity_delta", "unit": "PCU 360", "value": 10.0, "rationale": "Open 10 beds"}]
  )
  query = f"SELECT OPTIMIZE_SERVICE_UNIT_BEDS('stanford_childrens', '{constraints}') AS result"
  row = db_conn.execute(query).fetchone()
  assert row is not None
  result_json = row[0]
  assert isinstance(result_json, str)
  data = json.loads(result_json)
  assert isinstance(data, list)
  assert len(data) > 0
  assert "service" in data[0]
  assert "unit" in data[0]
  assert "optimized_patient_days" in data[0]


def test_census_quick_action_sql_macros(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Verify the four Bed-Use census SQL table macros execute cleanly."""
  by_unit = db_conn.execute("SELECT * FROM CENSUS_PATIENT_DAYS_BY_UNIT()").fetchall()
  assert len(by_unit) == 2

  by_svc = db_conn.execute("SELECT * FROM CENSUS_PATIENT_DAYS_BY_SERVICE()").fetchall()
  assert len(by_svc) == 2

  combined = db_conn.execute("SELECT * FROM CENSUS_COMBINED_BREAKDOWN()").fetchall()
  assert len(combined) == 2

  summary = db_conn.execute("SELECT * FROM CENSUS_SUMMARY_STATISTICS()").fetchone()
  assert summary == (2, 2, 2)


def test_udf_error_handling(db_conn: duckdb.DuckDBPyConnection) -> None:
  """Test that invalid JSON or unknown institution inputs return a structured error JSON object."""
  bad_json_row = db_conn.execute("SELECT OPTIMIZE_SERVICE_UNIT_BEDS('stanford_childrens', '{bad')").fetchone()
  assert bad_json_row is not None
  assert "error" in json.loads(bad_json_row[0])

  not_list_payload = json.dumps({"a": 1})
  not_list_row = db_conn.execute(
    f"SELECT OPTIMIZE_SERVICE_UNIT_BEDS('stanford_childrens', '{not_list_payload}')"
  ).fetchone()
  assert not_list_row is not None
  assert "must be a JSON list" in json.loads(not_list_row[0])["error"]

  unknown_inst_row = db_conn.execute("SELECT OPTIMIZE_SERVICE_UNIT_BEDS('unknown_hospital', '[]')").fetchone()
  assert unknown_inst_row is not None
  assert "error" in json.loads(unknown_inst_row[0])

  # Direct Python invocations to ensure deterministic main-thread coverage tracing
  direct_ok = json.loads(optimize_service_unit_beds_udf("stanford_childrens", "[]"))
  assert isinstance(direct_ok, list)
  assert len(direct_ok) > 0
  assert "error" in json.loads(optimize_service_unit_beds_udf("stanford_childrens", "{bad"))
  assert "must be a JSON list" in json.loads(optimize_service_unit_beds_udf("stanford_childrens", '{"a": 1}'))["error"]
  assert "error" in json.loads(optimize_service_unit_beds_udf("unknown_hospital", "[]"))
