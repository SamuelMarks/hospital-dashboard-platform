"""
Tests for Benchmark Data Integrity.

Verifies that the `benchmark_gold.json` file adheres to the required schema
and contains all 30 analytical themes required for the scientific evaluation
of the LLM Arena.
"""

import json
import os

import pytest

from app.core.result import Err, Ok
from app.schemas.json_types import JsonObject
from app.services.runners.sql import SQLSecurityError, validate_query_ast, validate_query_ast_result

# Path definition
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(CURRENT_DIR, "../data/benchmark_gold.json")


@pytest.fixture
def benchmark_data() -> list[JsonObject]:
  """Load the gold dataset from disk."""
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Benchmark file missing at {DATA_FILE}")

  with open(DATA_FILE, "r", encoding="utf-8") as f:
    data: list[JsonObject] = json.load(f)
    return data


def test_meta_header_exists(benchmark_data: list[JsonObject]) -> None:
  """Verify the file starts with a metadata object describing schema."""
  header = benchmark_data[0]
  assert "_meta" in header
  meta = header["_meta"]
  assert isinstance(meta, dict)
  assert meta["version"] == "1.0"


def test_row_count_and_themes(benchmark_data: list[JsonObject]) -> None:
  """Verify all 30 business themes are represented."""
  # Exclude metadata row
  data_rows = [r for r in benchmark_data if "_meta" not in r]

  assert len(data_rows) == 30, f"Expected 30 themes, found {len(data_rows)}"

  themes = {str(r["theme"]) for r in data_rows}
  required_samples = {"Predictive Availability", "Bottleneck Analysis", "The 'NICU Cliff'", "Midnight vs. Noon"}

  # Check if samples exist in the set
  for req in required_samples:
    assert req in themes, f"Missing theme: {req}"


def test_sql_syntax_validity(benchmark_data: list[JsonObject]) -> None:
  """
  Verify that every 'gold_sql' entry is syntactically valid DuckDB SQL.
  Uses the application's own AST validator.
  """
  data_rows = [r for r in benchmark_data if "_meta" not in r]

  for row in data_rows:
    sql = str(row["gold_sql"])
    theme = str(row["theme"])

    # 1. Check non-empty
    assert sql, f"Empty SQL for {theme}"
    assert len(sql.strip()) > 10, f"Empty SQL for {theme}"

    # 2. Key phrases presence
    # e.g. macro usage checks
    if "Probability" in theme:
      assert "PROBABILITY" in sql or "probability_pct" in sql

    # 3. Syntax Check via SQLGlot (Application Service)
    ast_result = validate_query_ast_result(sql)
    assert isinstance(ast_result, Ok), f"Invalid SQL Syntax in Benchmark Data for theme '{theme}': {ast_result}"
    validate_query_ast(sql)

  # 4. Negative check ensuring validator genuinely rejects malformed SQL
  bad_result = validate_query_ast_result("SELECT FROM WHERE ???")
  assert isinstance(bad_result, Err)
  with pytest.raises(SQLSecurityError):
    validate_query_ast("SELECT FROM WHERE ???")


def test_schema_concordance(benchmark_data: list[JsonObject]) -> None:
  """
  Ensure rows have the required keys: question, gold_sql, complexity.
  """
  data_rows = [r for r in benchmark_data if "_meta" not in r]

  for row in data_rows:
    assert "question" in row
    assert "gold_sql" in row
    assert "complexity" in row
    assert "theme" in row
    assert row["complexity"] in ["Low", "Medium", "High"]
