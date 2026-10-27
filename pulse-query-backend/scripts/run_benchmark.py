"""
Offline Benchmark Runner.

This CLI utility executes a comprehensive evaluation of the LLM Swarm against
the Gold Standard Dataset (`pulse-query-backend/data/benchmark_gold.json`).

It performs "Data Equivalence" testing:
1. Executes the 'Gold SQL' to get the ground truth result set.
2. Generates SQL via the Arena (for every Model + Strategy combo).
3. Executes the 'Generated SQL'.
4. Compares the two result sets.

If the data matches (tolerance for float rounding and row sorting), the generation
is marked as ACCURATE.

Usage:
    uv run python scripts/run_benchmark.py --dry-run
    uv run python scripts/run_benchmark.py --strategy all --output leaderboard.csv
"""

import argparse
import asyncio
from collections.abc import Sequence
import csv
from datetime import UTC, datetime
import json
import logging
import os
import sys
import traceback
from typing import TypedDict
import uuid

from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import create_hospital_macros
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.schemas.json_types import JsonObject, SqlScalar
from app.services.sql_generator import ExperimentSessionProtocol, sql_generator

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("benchmark_runner")

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
GOLD_FILE = os.path.join(DATA_DIR, "benchmark_gold.json")


class BenchmarkEvaluationRowDict(TypedDict):
  """
  Typed dictionary representing a single benchmark evaluation CSV row.

  Attributes:
      Timestamp (str): ISO-8601 execution timestamp.
      Theme (str): Analytical theme category.
      Complexity (str): Complexity tier.
      Strategy (str): Prompt engineering strategy tag.
      Model (str): Evaluated LLM model tag.
      LatencyMs (int): Generation latency in milliseconds.
      Success (bool): True if candidate SQL output matched gold SQL output.
      ExecError (bool): True if candidate SQL raised a DuckDB execution error.
      ErrorMsg (str): Execution error message or empty string.
      SQLHash (str): Normalized SQL SHA-256 fingerprint.
      GeneratedSQL (str): Truncated candidate SQL snippet.
  """

  Timestamp: str
  Theme: str
  Complexity: str
  Strategy: str
  Model: str
  LatencyMs: int
  Success: bool
  ExecError: bool
  ErrorMsg: str
  SQLHash: str
  GeneratedSQL: str


class InMemoryExperimentSession(ExperimentSessionProtocol):
  """
  Lightweight strongly typed in-memory session implementing `ExperimentSessionProtocol`
  for offline benchmark runs without requiring `unittest.mock` or a live PostgreSQL server.
  """

  def __init__(self) -> None:
    """Initializes the in-memory store for `ExperimentLog` and `ModelCandidate` entities."""
    self.store: list[ExperimentLog | ModelCandidate] = []

  def add(self, instance: ExperimentLog | ModelCandidate) -> None:
    """
    Stages an `ExperimentLog` or `ModelCandidate` entity in `self.store`.

    Args:
        instance (ExperimentLog | ModelCandidate): Entity to store.
    """
    self.store.append(instance)

  async def flush(self) -> None:
    """Assigns UUIDs and default selection flags to pending entities in `self.store`."""
    for obj in self.store:
      if not obj.id:
        obj.id = uuid.uuid4()
      if isinstance(obj, ModelCandidate) and obj.is_selected is None:
        obj.is_selected = False

  async def commit(self) -> None:
    """Commits pending entities by delegating to `flush()`."""
    await self.flush()

  async def refresh(self, instance: ExperimentLog) -> None:
    """
    Populates `id`, `created_at`, and `candidates` on `instance` from `self.store`.

    Args:
        instance (ExperimentLog): Experiment log instance to refresh.
    """
    if not instance.id:
      instance.id = uuid.uuid4()
    if not instance.created_at:
      instance.created_at = datetime.now(UTC)
    instance.candidates = [c for c in self.store if isinstance(c, ModelCandidate) and c.experiment_id == instance.id]


class BenchmarkRunner:
  """
  Orchestrator for the offline evaluation process.
  """

  def __init__(self, dry_run: bool = False, output_file: str = "leaderboard.csv") -> None:
    """
    Initialize the runner.

    Args:
        dry_run (bool): If True, skips actual LLM calls and returns mock SQL.
        output_file (str): Path to save the CSV report.
    """
    self.dry_run = dry_run
    self.output_file = output_file
    self.dataset = self._load_dataset()
    self._init_duckdb()

  def _load_dataset(self) -> list[JsonObject]:
    """
    Loads the Gold Standard JSON.

    Returns:
        list[JsonObject]: The list of test cases (minus metadata).
    """
    if not os.path.exists(GOLD_FILE):
      logger.error(f"❌ Gold dataset not found at {GOLD_FILE}")
      sys.exit(1)

    with open(GOLD_FILE, "r", encoding="utf-8") as f:
      data: list[JsonObject] = json.load(f)

    return [r for r in data if "_meta" not in r]

  def _init_duckdb(self) -> None:
    """
    Prepares the DuckDB connection with required Macros/UDFs.
    The Gold SQL relies on these macros (e.g. PROBABILITY), so they must be loaded.
    """
    try:
      conn = duckdb_manager.get_connection()
      create_hospital_macros(conn)
      conn.close()
      logger.info("✅ DuckDB Macros initialized.")
    except Exception as e:
      logger.warning(f"⚠️ Failed to init DuckDB (Data might be missing): {e}")

  def _execute_sql(self, sql: str) -> tuple[list[tuple[SqlScalar, ...]] | None, str | None]:
    """
    Executes SQL safely against the Read-Only engine.

    Args:
        sql (str): The query to run.

    Returns:
        tuple[list[tuple[SqlScalar, ...]] | None, str | None]: `(ResultList, ErrorString)`
        - ResultList is a list of tuples (rows).
        - ErrorString is the exception message if failed.
    """
    if not sql or not sql.strip():
      return None, "Empty Query"

    conn = duckdb_manager.get_readonly_connection()
    try:
      cursor = conn.execute(sql)
      rows = cursor.fetchall()
      return rows, None
    except Exception as e:
      return None, str(e)
    finally:
      conn.close()

  def _compare_results(
    self,
    gold_rows: Sequence[tuple[SqlScalar, ...]] | None,
    gen_rows: Sequence[tuple[SqlScalar, ...]] | None,
  ) -> bool:
    """
    Determines if two result sets are equivalent.

    Strategies:
    1. Exact Row Count Match.
    2. Set comparison (ignoring order) for the first column (often IDs).
    3. Rounding for floats (tolerance 0.01).

    Args:
        gold_rows (Sequence[tuple[SqlScalar, ...]] | None): The ground truth data.
        gen_rows (Sequence[tuple[SqlScalar, ...]] | None): The candidate data.

    Returns:
        bool: True if data is equivalent.
    """
    if gold_rows is None or gen_rows is None:
      return False

    if len(gold_rows) != len(gen_rows):
      return False

    if len(gold_rows) == 0:
      return True

    def normalize(row: tuple[SqlScalar, ...]) -> str:
      """
      Formats a single result row tuple into a pipe-delimited string with rounded floats.

      Args:
          row (tuple[SqlScalar, ...]): Database result row tuple.

      Returns:
          str: Normalized pipe-delimited row string.
      """
      cleaned = [f"{item:.2f}" if isinstance(item, float) else str(item) for item in row]
      return "|".join(cleaned)

    gold_set = {normalize(r) for r in gold_rows}
    gen_set = {normalize(r) for r in gen_rows}

    return gold_set == gen_set

  def _create_mock_db(self) -> InMemoryExperimentSession:
    """
    Creates a strongly typed `InMemoryExperimentSession` for offline benchmark execution.

    Returns:
        InMemoryExperimentSession: Configured in-memory experiment session.
    """
    return InMemoryExperimentSession()

  async def _evaluate_strategy_case(
    self,
    case: JsonObject,
    strategy: str,
    gold_rows: Sequence[tuple[SqlScalar, ...]] | None,
    session_db: ExperimentSessionProtocol,
    bench_user: User,
  ) -> list[BenchmarkEvaluationRowDict]:
    """
    Runs a single benchmark case for a given prompt strategy and evaluates candidate SQLs.

    Args:
        case (JsonObject): Gold benchmark test case dictionary.
        strategy (str): Strategy identifier string.
        gold_rows (Sequence[tuple[SqlScalar, ...]] | None): Ground truth SQL result rows.
        session_db (ExperimentSessionProtocol): Experiment persistence session.
        bench_user (User): Benchmark user entity.

    Returns:
        list[BenchmarkEvaluationRowDict]: List of evaluation result rows for this case and strategy.
    """
    rows_out: list[BenchmarkEvaluationRowDict] = []
    experiment = await sql_generator.run_arena_experiment(
      user_query=str(case["question"]), db=session_db, user=bench_user, strategy=strategy, dry_run=self.dry_run
    )

    for candidate in experiment.candidates:
      gen_sql = candidate.generated_sql
      gen_rows, gen_err = self._execute_sql(gen_sql)
      is_correct = self._compare_results(gold_rows, gen_rows) if not gen_err else False

      nl = chr(10)
      rows_out.append(
        {
          "Timestamp": datetime.now().isoformat(),
          "Theme": str(case["theme"]),
          "Complexity": str(case["complexity"]),
          "Strategy": strategy,
          "Model": candidate.model_tag,
          "LatencyMs": int(candidate.latency_ms or 0),
          "Success": is_correct,
          "ExecError": bool(gen_err),
          "ErrorMsg": gen_err or "",
          "SQLHash": candidate.sql_hash or "",
          "GeneratedSQL": gen_sql.replace(nl, " ")[:100],
        }
      )
    return rows_out

  async def run(self, strategies: list[str]) -> None:
    """
    Main execution loop.

    Args:
        strategies (list[str]): List of strategies to test (e.g. ['zero-shot', 'rag-few-shot']).
    """
    results_log: list[BenchmarkEvaluationRowDict] = []
    bench_user = User(email="benchmarker@pulse.com", hashed_password="x")
    bench_user.id = uuid.uuid4()
    session_db = self._create_mock_db()

    total_cases = len(self.dataset) * len(strategies)
    logger.info(
      f"🚀 Starting Benchmark: {len(self.dataset)} questions x {len(strategies)} strategies = {total_cases} passes"
    )

    for case in self.dataset:
      theme = str(case["theme"])
      gold_rows, gold_err = self._execute_sql(str(case["gold_sql"]))
      if gold_err:
        logger.error(f"❌ Gold SQL Failed for '{theme}': {gold_err}")
        continue

      for strategy in strategies:
        logger.info(f"   >> Processing '{theme}' with {strategy}...")
        try:
          case_rows = await self._evaluate_strategy_case(case, strategy, gold_rows, session_db, bench_user)
          results_log.extend(case_rows)
        except Exception as e:
          logger.error(f"Error in benchmark loop: {e}")
          traceback.print_exc()

    self._save_report(results_log)

  def _save_report(self, results: Sequence[BenchmarkEvaluationRowDict]) -> None:
    """
    Writes the results to a CSV file.

    Args:
        results (Sequence[BenchmarkEvaluationRowDict]): List of result dictionaries.
    """
    if not results:
      logger.warning("No results to save.")
      return

    with open(self.output_file, "w", newline="", encoding="utf-8") as f:
      writer = csv.DictWriter(f, fieldnames=results[0].keys())
      writer.writeheader()
      writer.writerows(results)

    logger.info(f"✅ Benchmark Complete. Report saved to {self.output_file}")

    success_count = sum(1 for r in results if r["Success"])
    total = len(results)
    nl = chr(10)
    print(f"{nl}Overall Accuracy: {(success_count / total) * 100:.1f}% ({success_count}/{total})")


def main(argv: list[str] | None = None) -> None:
  """
  CLI entry point for the offline benchmark runner.

  Args:
      argv (list[str] | None): Optional CLI arguments list.
  """
  parser = argparse.ArgumentParser(description="Pulse Query Benchmark Runner")
  parser.add_argument("--dry-run", action="store_true", help="Skip LLM API calls, use mocks.")
  parser.add_argument("--output", type=str, default="leaderboard.csv", help="Output CSV path.")
  parser.add_argument(
    "--strategies", nargs="+", default=["zero-shot", "cot-macro", "rag-few-shot"], help="Strategies to test."
  )

  args = parser.parse_args(argv)

  runner = BenchmarkRunner(dry_run=args.dry_run, output_file=args.output)
  asyncio.run(runner.run(strategies=args.strategies))


if __name__ == "__main__":
  main()
