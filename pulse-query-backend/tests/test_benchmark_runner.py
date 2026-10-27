"""
Tests for the Offline Benchmark Runner.

Verifies the logic for:
1. Loading the Gold Dataset (Schema validation for the runner's context).
2. Executing SQL safely (DuckDB integration).
3. Comparing Result Sets (The core scoring logic).
4. Full Run Orchestration (dry-run mode).
"""

import asyncio
from collections.abc import Coroutine
from datetime import UTC, datetime
import importlib
import os
from pathlib import Path
import sys
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch
import uuid

import pytest

from app.models.feedback import ExperimentLog, ModelCandidate
from app.schemas.json_types import JsonObject

CURRENT_FILE = os.path.abspath(__file__)
TESTS_DIR = os.path.dirname(CURRENT_FILE)
BACKEND_ROOT = os.path.dirname(TESTS_DIR)

if BACKEND_ROOT not in sys.path:
  sys.path.insert(0, BACKEND_ROOT)

if TYPE_CHECKING:
  from scripts.run_benchmark import BenchmarkEvaluationRowDict, BenchmarkRunner
else:
  _bench_mod = importlib.import_module("scripts.run_benchmark")
  BenchmarkRunner = _bench_mod.BenchmarkRunner
  BenchmarkEvaluationRowDict = _bench_mod.BenchmarkEvaluationRowDict

MOCK_DATASET: list[JsonObject] = [
  {"theme": "Test Theme", "question": "Count rows", "gold_sql": "SELECT count(*) FROM t1", "complexity": "Low"}
]


@pytest.fixture
def runner(tmp_path: Path) -> BenchmarkRunner:
  """
  Creates a `BenchmarkRunner` instance configured with `MOCK_DATASET` and a temporary output file.

  Args:
      tmp_path (Path): Temporary directory path fixture.

  Returns:
      BenchmarkRunner: Runner instance in dry-run mode.
  """
  runner_inst = BenchmarkRunner(dry_run=True, output_file=str(tmp_path / "test_report.csv"))
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
  """Test that floating point differences are handled via string normalization."""
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
  """Test that `_execute_sql` catches DuckDB errors and returns them as strings."""
  with patch("scripts.run_benchmark.duckdb_manager.get_readonly_connection") as mock_get:
    mock_conn = MagicMock()
    mock_conn.execute.side_effect = Exception("Syntax Error")
    mock_get.return_value = mock_conn

    rows, err = runner._execute_sql("BAD SQL")
    assert rows is None
    assert err is not None
    assert "Syntax Error" in err


def test_execute_sql_real_duckdb_integration(runner: BenchmarkRunner) -> None:
  """Verifies `_execute_sql` and `_compare_results` against a real in-memory DuckDB connection."""
  import duckdb

  mem_conn = duckdb.connect(":memory:")
  mem_conn.execute("CREATE TABLE hospital_data (Service VARCHAR, Patient_Count INTEGER)")
  mem_conn.execute("INSERT INTO hospital_data VALUES ('Cardiology', 12), ('Neurology', 8)")

  class _NonClosingProxy:
    """Proxy delegating `execute` to `mem_conn` while keeping `mem_conn` open across calls."""

    def execute(self, query: str) -> duckdb.DuckDBPyConnection:
      """Executes `query` on the underlying in-memory DuckDB connection."""
      return mem_conn.execute(query)

    def close(self) -> None:
      """No-op close so multiple queries can inspect the same in-memory table."""

  with patch("scripts.run_benchmark.duckdb_manager.get_readonly_connection", side_effect=_NonClosingProxy):
    gold_rows, gold_err = runner._execute_sql("SELECT Service, SUM(Patient_Count) FROM hospital_data GROUP BY Service")
    gen_rows, gen_err = runner._execute_sql(
      "SELECT Service, SUM(Patient_Count) AS total FROM hospital_data GROUP BY Service ORDER BY Service DESC"
    )
    wrong_rows, wrong_err = runner._execute_sql("SELECT Service, COUNT(*) FROM hospital_data GROUP BY Service")

  mem_conn.close()
  assert gold_err is None
  assert gen_err is None
  assert wrong_err is None
  assert runner._compare_results(gold_rows, gen_rows) is True
  assert runner._compare_results(gold_rows, wrong_rows) is False


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
  Ensures it iterates strategies and writes the CSV report.
  """
  with (
    patch.object(runner, "_execute_sql", return_value=([(10,)], None)) as mock_exec,
    patch("scripts.run_benchmark.sql_generator.schema_svc") as mock_schema,
  ):
    mock_schema.get_schema_context_string.return_value = "CREATE TABLE t (id INT);"
    await runner.run(strategies=["zero-shot"])
    assert _verify_and_cleanup_report(runner.output_file)
    assert mock_exec.call_count >= 2


@pytest.mark.asyncio
async def test_benchmark_runner_edge_cases(runner: BenchmarkRunner, tmp_path: Path) -> None:
  """Verify edge branches in BenchmarkRunner and end-to-end CLI execution writing CSV output."""
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
  cand_none = ModelCandidate(model_tag="m2", generated_sql="SELECT 2", is_selected=None)

  cand.id = uuid.uuid4()
  mock_db.add(cand)
  mock_db.add(cand_none)
  await mock_db.flush()
  assert cand_none.is_selected is False

  dummy_obj = MagicMock()
  dummy_obj.id = uuid.uuid4()
  dummy_obj.created_at = datetime.now(UTC)
  await mock_db.refresh(dummy_obj)

  exp = ExperimentLog(
    id=None,
    user_id=uuid.uuid4(),
    prompt_text="q",
    prompt_strategy="zero-shot",
    created_at=None,
  )
  await mock_db.refresh(exp)
  assert exp.id is not None

  # 6. Gold SQL failure and strategy exception in run(), plus empty _save_report
  runner._save_report([])
  sample_row: BenchmarkEvaluationRowDict = {
    "Timestamp": "2026-01-01T00:00:00",
    "Theme": "T",
    "Complexity": "Easy",
    "Strategy": "zero-shot",
    "Model": "M",
    "LatencyMs": 10,
    "Success": False,
    "ExecError": False,
    "ErrorMsg": "",
    "SQLHash": "h",
    "GeneratedSQL": "SELECT 1",
  }
  runner._save_report([sample_row])

  with patch.object(runner, "_execute_sql", return_value=(None, "Gold Error")):
    await runner.run(strategies=["zero-shot"])

  with (
    patch.object(runner, "_execute_sql", return_value=([(1,)], None)),
    patch.object(runner, "_evaluate_strategy_case", side_effect=RuntimeError("arena boom")),
  ):
    await runner.run(strategies=["zero-shot"])

  # 7. CLI main() executes end-to-end against Mock dataset and writes real CSV file
  out_csv = tmp_path / "cli_out.csv"
  loop = asyncio.get_running_loop()
  cli_tasks: list[asyncio.Task[None]] = []

  def _schedule_runner(coro: Coroutine[None, None, None]) -> None:
    """
    Schedules the `BenchmarkRunner.run` coroutine onto the active test event loop.

    Args:
        coro (Coroutine[None, None, None]): Coroutine passed to `asyncio.run`.
    """
    cli_tasks.append(loop.create_task(coro))

  with (
    patch.object(BenchmarkRunner, "_load_dataset", return_value=MOCK_DATASET),
    patch.object(BenchmarkRunner, "_init_duckdb", return_value=None),
    patch.object(BenchmarkRunner, "_execute_sql", return_value=([(1,)], None)),
    patch("scripts.run_benchmark.asyncio.run", side_effect=_schedule_runner),
  ):
    runner_main(["--dry-run", "--output", str(out_csv), "--strategies", "zero-shot"])
    for task in cli_tasks:
      await task
  assert out_csv.exists()
  csv_text = out_csv.read_text(encoding="utf-8")
  assert "Theme" in csv_text
  assert "zero-shot" in csv_text
