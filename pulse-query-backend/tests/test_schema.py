"""Tests for `SchemaService` metadata and prompt context generation."""

import pytest

from app.database.duckdb_init import init_duckdb_on_startup
from app.services.data_ingestion import DataIngestionService
from app.services.schema import schema_service


@pytest.fixture(autouse=True, scope="module")
def setup_schema_tests() -> None:
  """Ingests CSV tables and initializes DuckDB macros before running schema tests."""
  DataIngestionService.ingest_all_csvs()
  init_duckdb_on_startup()


def test_schema_string_generation() -> None:
  """
  Verifies that the schema string is generated and includes:
  1. Ingested Tables (Tables/Columns).
  2. DuckDB Macros (Statistical functions).
  3. Optimization UDFs.
  4. Example Patterns.
  """
  schema_str = schema_service.get_schema_context_string()

  assert "Table: hospital_data" in schema_str
  assert "visit_id" in schema_str
  assert "billing_amount" in schema_str

  assert "AVAILABLE DUCKDB MACROS" in schema_str
  assert "PROBABILITY" in schema_str
  assert "IS_BOTTLENECK" in schema_str

  assert "OPTIMIZE_ASSIGNMENTS" in schema_str

  assert "EXAMPLE QUERIES" in schema_str
  assert "SELECT PROBABILITY" in schema_str


def test_schema_json_generation() -> None:
  """Verifies the structured JSON output used by the frontend builders."""
  data = schema_service.get_schema_json()

  assert isinstance(data, list)
  assert len(data) > 0

  table = next((t for t in data if t["table_name"] == "hospital_data"), None)
  assert table is not None, "hospital_data table not found in schema"

  assert len(table["columns"]) > 0
