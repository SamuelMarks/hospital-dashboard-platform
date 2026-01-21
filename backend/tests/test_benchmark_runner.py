"""
Tests for the Offline Benchmark Runner.

Verifies the logic for:
1. Loading the Gold Dataset (Schema validation for the runner's context).
2. Executing SQL safely (DuckDB integration).
3. Comparing Result Sets (The core scoring logic).
4. Full Run Orchestration (dry-run mode).
"""

import sys
import os
import pytest
from unittest.mock import MagicMock, patch

# Handle PYTHONPATH injection for the scripts package
CURRENT_FILE = os.path.abspath(__file__)
TESTS_DIR = os.path.dirname(CURRENT_FILE)
BACKEND_ROOT = os.path.dirname(TESTS_DIR)

if BACKEND_ROOT not in sys.path:
  sys.path.insert(0, BACKEND_ROOT)

from scripts.run_benchmark import BenchmarkRunner

# Dummy Dataset for Testing
MOCK_DATASET = [
  {"theme": "Test Theme", "question": "Count rows", "gold_sql": "SELECT count(*) FROM t1", "complexity": "Low"}
]


@pytest.fixture
def runner() -> BenchmarkRunner:
  """Creates a runner instance hooked to a temp file."""
  runner_inst = BenchmarkRunner(dry_run=True, output_file="test_report.csv")
  # Inject mock dataset to avoid file I/O dependency in unit tests
  runner_inst.dataset = MOCK_DATASET
  return runner_inst


def test_compare_results_exact_match(runner: BenchmarkRunner) -> None:
  """Test standard equivalence."""
  gold = [(1, "A"), (2, "B")]
  gen = [(1, "A"), (2, "B")]
  assert runner._compare_results(gold, gen) is True


def test_compare_results_order_insensitivity(runner: BenchmarkRunner) -> None:
  """Test that row order does not fail the check (Set comparison)."""
  gold = [(1, "A"), (2, "B")]
  gen = [(2, "B"), (1, "A")]
  assert runner._compare_results(gold, gen) is True


def test_compare_results_mismatch(runner: BenchmarkRunner) -> None:
  """Test that different data returns False."""
  gold = [(1, "A")]
  gen = [(1, "B")]
  assert runner._compare_results(gold, gen) is False


def test_compare_results_float_rounding(runner: BenchmarkRunner) -> None:
  """
  Test that floating point differences are handled via string normalization.
  """
  gold = [(10.001,)]
  gen = [(10.004,)]
  assert runner._compare_results(gold, gen) is True

  gen_diff = [(10.05,)]
  assert runner._compare_results(gold, gen_diff) is False


def test_compare_results_empty_sets(runner: BenchmarkRunner) -> None:
  """Test handling of empty result sets."""
  assert runner._compare_results([], []) is True
  assert runner._compare_results([(1,)], []) is False


def test_execute_sql_safety(runner: BenchmarkRunner) -> None:
  """
  Test that _execute_sql catches DuckDB errors and returns them as strings.
  """
  with patch("scripts.run_benchmark.duckdb_manager.get_readonly_connection") as mock_get:
    mock_conn = MagicMock()
    mock_conn.execute.side_effect = Exception("Syntax Error")
    mock_get.return_value = mock_conn

    rows, err = runner._execute_sql("BAD SQL")
    assert rows is None
    assert "Syntax Error" in err


@pytest.mark.asyncio
async def test_full_run_dry_mode(runner: BenchmarkRunner) -> None:
  """
  Test the main loop in dry-run mode.
  Ensures it iterates strategies and attempts to save report.
  We must mock the components that sql_generator uses internally (schema_svc).
  """
  # 1. Mock SQL Execution to always succeed return 10
  with patch.object(runner, "_execute_sql", return_value=([(10,)], None)) as mock_exec:
    # 2. Mock Schema Service to prevent real DB access during message build
    with patch("scripts.run_benchmark.sql_generator.schema_svc") as mock_schema:
      mock_schema.get_schema_context_string.return_value = "CREATE TABLE t (id INT);"

      # 3. Run
      await runner.run(strategies=["zero-shot"])

      # 4. Verify Report
      try:
        assert os.path.exists("test_report.csv")
        # Should have run Gold SQL (1) and Gen SQL (1)
        assert mock_exec.call_count >= 2
      finally:
        if os.path.exists("test_report.csv"):
          os.remove("test_report.csv")
