from app.services.schema import schema_service  # type: ignore


def test_schema_string_generation() -> None:
  """
  Verifies that the schema string is generated and includes:
  1. Ingested Tables (Tables/Columns).
  2. DuckDB Macros (Statistical functions).
  3. Optimization UDFs.
  4. Example Patterns.

  Note: This test depends on ingestion having run or the DB file being present.
  We check for the table derived from 'hospital_data.csv' which becomes 'hospital_data'.
  """
  schema_str = schema_service.get_schema_context_string()

  # 1. Check for Table Existence
  assert "Table: hospital_data" in schema_str
  assert "visit_id" in schema_str
  assert "billing_amount" in schema_str

  # 2. Check for Macros presence
  assert "AVAILABLE DUCKDB MACROS" in schema_str
  assert "PROBABILITY" in schema_str
  assert "IS_BOTTLENECK" in schema_str

  # 3. Check for UDF presence
  assert "OPTIMIZE_ASSIGNMENTS" in schema_str

  # 4. Check for Examples presence
  assert "EXAMPLE QUERIES" in schema_str
  assert "SELECT PROBABILITY" in schema_str

  print("\n--- Generated Schema Context ---")
  print(schema_str)
  print("--------------------------------")


def test_schema_json_generation() -> None:
  """
  Verifies the structured JSON output used by the frontend builders.
  """
  data = schema_service.get_schema_json()

  assert isinstance(data, list)
  assert len(data) > 0

  # Find hospital_data table in list
  table = next((t for t in data if t["table_name"] == "hospital_data"), None)
  assert table is not None, "hospital_data table not found in schema"

  assert len(table["columns"]) > 0
