"""
Tests for the Offline Benchmark Runner.

Verifies the logic for:
1. Loading the Gold Dataset (Schema validation for the runner's context).
2. Executing SQL safely (DuckDB integration).
3. Comparing Result Sets (The core scoring logic).
4. Full Run Orchestration (dry-run mode).
"""

import importlib
import os
import sys
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock, patch

import pytest

# Handle PYTHONPATH injection for the scripts package
CURRENT_FILE = os.path.abspath(__file__)
TESTS_DIR = os.path.dirname(CURRENT_FILE)
BACKEND_ROOT = os.path.dirname(TESTS_DIR)

if BACKEND_ROOT not in sys.path:
  sys.path.insert(0, BACKEND_ROOT)

if TYPE_CHECKING:
  from scripts.run_benchmark import BenchmarkRunner
else:
  BenchmarkRunner = importlib.import_module("scripts.run_benchmark").BenchmarkRunner

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


def _verify_and_cleanup_report(filepath: str) -> bool:
  """
  Checks whether `filepath` exists on disk and removes it if present.

  Args:
      filepath (str): Report file path.

  Returns:
      bool: True if the file existed.
  """
  exists = os.path.exists(filepath)
  if exists:
    os.remove(filepath)
  return exists


@pytest.mark.asyncio
async def test_full_run_dry_mode(runner: BenchmarkRunner) -> None:
  """
  Test the main loop in dry-run mode.
  Ensures it iterates strategies and attempts to save report.
  We must mock the components that sql_generator uses internally (schema_svc).
  """
  with (
    patch.object(runner, "_execute_sql", return_value=([(10,)], None)) as mock_exec,
    patch("scripts.run_benchmark.sql_generator.schema_svc") as mock_schema,
  ):
    mock_schema.get_schema_context_string.return_value = "CREATE TABLE t (id INT);"
    await runner.run(strategies=["zero-shot"])
    assert _verify_and_cleanup_report("test_report.csv")
    assert mock_exec.call_count >= 2


@pytest.mark.asyncio
async def test_benchmark_runner_edge_cases(runner: BenchmarkRunner, tmp_path: Any) -> None:
  """Verify edge branches in BenchmarkRunner (_load_dataset missing, _init_duckdb error, empty query, etc.)."""
  from app.models.feedback import ExperimentLog, ModelCandidate
  from scripts.run_benchmark import main as runner_main

  # 1. Missing GOLD_FILE exits with 1
  with patch("scripts.run_benchmark.os.path.exists", return_value=False):
    with pytest.raises(SystemExit) as exc:
      runner._load_dataset()
    assert exc.value.code == 1

  # 2. _init_duckdb exception logs warning without crashing
  with patch("scripts.run_benchmark.duckdb_manager.get_connection", side_effect=RuntimeError("duckdb locked")):
    runner._init_duckdb()

  # 3. _execute_sql with empty query and successful query
  assert runner._execute_sql("") == (None, "Empty Query")
  with patch("scripts.run_benchmark.duckdb_manager.get_readonly_connection") as mock_get:
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = [(1,)]
    mock_get.return_value = mock_conn
    rows, err = runner._execute_sql("SELECT 1")
    assert rows == [(1,)]
    assert err is None

  # 4. _compare_results with None
  assert runner._compare_results(None, [(1,)]) is False

  # 5. _create_mock_db branches (pre-populated id/created_at, non-ExperimentLog refresh)
  mock_db = runner._create_mock_db()
  cand = ModelCandidate(model_tag="m", generated_sql="SELECT 1", is_selected=True)
  cand_none = ModelCandidate(model_tag="m2", generated_sql="SELECT 2")
  cand_none.is_selected = None  # type: ignore[assignment]
  import uuid
  from datetime import UTC, datetime

  cand.id = uuid.uuid4()
  mock_db.add(cand)
  mock_db.add(cand_none)
  await mock_db.flush()
  assert cand_none.is_selected is False

  dummy_obj = MagicMock()
  dummy_obj.id = uuid.uuid4()
  dummy_obj.created_at = datetime.now(UTC)
  await mock_db.refresh(dummy_obj)

  exp = ExperimentLog(user_id=uuid.uuid4(), prompt_text="q", prompt_strategy="zero-shot")
  exp.id = None
  exp.created_at = None
  await mock_db.refresh(exp)
  assert exp.id is not None

  # 6. Gold SQL failure and strategy exception in run(), plus empty _save_report
  runner._save_report([])
  runner._save_report([{"Success": False, "Model": "M"}])

  with patch.object(runner, "_execute_sql", return_value=(None, "Gold Error")):
    await runner.run(strategies=["zero-shot"])

  with (
    patch.object(runner, "_execute_sql", return_value=([(1,)], None)),
    patch.object(runner, "_evaluate_strategy_case", side_effect=RuntimeError("arena boom")),
  ):
    await runner.run(strategies=["zero-shot"])

  # 7. CLI main()
  out_csv = tmp_path / "cli_out.csv"
  with (
    patch("scripts.run_benchmark.asyncio.run") as mock_asio_run,
    patch.object(BenchmarkRunner, "run", new=MagicMock(return_value="coro")) as mock_run,
  ):
    runner_main(["--dry-run", "--output", str(out_csv), "--strategies", "zero-shot"])
    mock_run.assert_called_once_with(strategies=["zero-shot"])
    mock_asio_run.assert_called_once_with("coro")
