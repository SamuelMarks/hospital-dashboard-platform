"""
Tests for DuckDB User Defined Functions (UDFs).

Verifies that the Python-to-SQL bridge functions are correctly registered
and callable via standard SQL queries using the DuckDB Python API.
"""

import json
import pytest
import duckdb
from app.database.duckdb_init import create_hospital_macros


@pytest.fixture
def db_conn() -> duckdb.DuckDBPyConnection:
  """
  Fixture providing an in-memory DuckDB connection
  populated with registered macros and UDFs.
  """
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)
  yield conn
  conn.close()


def test_optimize_assignments_udf_execution(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Test calling the OPTIMIZE_ASSIGNMENTS function via SQL.
  """
  # Prepare JSON inputs
  demand = json.dumps({"ServiceA": 10, "ServiceB": 10})
  capacity = json.dumps({"Unit1": 10, "Unit2": 10})
  affinity = json.dumps({})
  constraints = json.dumps([])

  # Execute SQL
  query = f"""
        SELECT OPTIMIZE_ASSIGNMENTS('{demand}', '{capacity}', '{affinity}', '{constraints}') as result
    """
  row = db_conn.execute(query).fetchone()

  assert row is not None
  result_json = row[0]

  # Validation
  assert isinstance(result_json, str)
  data = json.loads(result_json)
  assert isinstance(data, list)
  assert len(data) > 0
  assert "Service" in data[0]
  assert "Unit" in data[0]


def test_optimize_assignments_integration_with_duckdb_json(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Test using DuckDB's native JSON extensions to parse the UDF result.
  """
  demand = json.dumps({"ServiceA": 5})
  capacity = json.dumps({"Unit1": 5})

  # Complex Query: Call UDF -> Force JSON Type -> Unnest List -> Select Struct Fields
  # The result of from_json/unnest can sometimes retain DuckDB's string wrapping
  query = f"""
        WITH raw_json AS (
            SELECT OPTIMIZE_ASSIGNMENTS('{demand}', '{capacity}', '{{}}', '[]') as j
        )
        SELECT
            unnest(from_json(j, '["json"]')) as rec
        FROM raw_json
    """

  final_query = f"""
        SELECT
            rec.Service::VARCHAR,
            rec.Unit::VARCHAR,
            rec.Patient_Count::DOUBLE
        FROM ({query})
    """

  results = db_conn.execute(final_query).fetchall()

  assert len(results) == 1
  row = results[0]

  # DuckDB's JSON extraction might behave differently across versions regarding quotes
  # We strip potential quotes to be safe assurance.
  service_val = row[0].replace('"', "") if row[0] else row[0]
  unit_val = row[1].replace('"', "") if row[1] else row[1]
  count_val = row[2]

  assert service_val == "ServiceA"
  assert unit_val == "Unit1"
  assert count_val == 5.0


def test_udf_error_handling(db_conn: duckdb.DuckDBPyConnection) -> None:
  """
  Test that invalid JSON inputs passed to the UDF do not crash the SQL engine
  but return an error JSON structure.
  """
  # Malformed JSON inputs
  query = "SELECT OPTIMIZE_ASSIGNMENTS('{bad', '}', '{}', '{}') as result"

  row = db_conn.execute(query).fetchone()
  assert row is not None

  data = json.loads(row[0])
  assert "error" in data
