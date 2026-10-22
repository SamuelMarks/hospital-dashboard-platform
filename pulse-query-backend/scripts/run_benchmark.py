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
import csv
import json
import logging
import os
import sys
import traceback
import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

# Add src to path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import create_hospital_macros
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.services.sql_generator import sql_generator

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("benchmark_runner")

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
GOLD_FILE = os.path.join(DATA_DIR, "benchmark_gold.json")


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

  def _load_dataset(self) -> list[dict[str, Any]]:
    """
    Loads the Gold Standard JSON.

    Returns:
        List[Dict[str, Any]]: The list of test cases (minus metadata).
    """
    if not os.path.exists(GOLD_FILE):
      logger.error(f"❌ Gold dataset not found at {GOLD_FILE}")
      sys.exit(1)

    with open(GOLD_FILE, "r", encoding="utf-8") as f:
      data = json.load(f)

    # Filter out metadata row
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

  def _execute_sql(self, sql: str) -> tuple[list[Any] | None, str | None]:
    """
    Executes SQL safely against the Read-Only engine.

    Args:
        sql (str): The query to run.

    Returns:
        Tuple: (ResultList, ErrorString)
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

  def _compare_results(self, gold_rows: list[Any] | None, gen_rows: list[Any] | None) -> bool:
    """
    Determines if two result sets are equivalent.

    Strategies:
    1. Exact Row Count Match.
    2. Set comparison (ignoring order) for the first column (often IDs).
    3. Rounding for floats (tolerance 0.01).

    Args:
        gold_rows: The ground truth data.
        gen_rows: The candidate data.

    Returns:
        bool: True if data is equivalent.
    """
    if gold_rows is None or gen_rows is None:
      return False

    if len(gold_rows) != len(gen_rows):
      return False

    if len(gold_rows) == 0:
      return True  # Both empty = Match

    def normalize(row: tuple[Any, ...]) -> str:
      """
      Formats a single result row tuple into a pipe-delimited string with rounded floats.

      Args:
          row (tuple[Any, ...]): Database result row tuple.

      Returns:
          str: Normalized pipe-delimited row string.
      """
      cleaned = [f"{item:.2f}" if isinstance(item, float) else str(item) for item in row]
      return "|".join(cleaned)

    gold_set = {normalize(r) for r in gold_rows}
    gen_set = {normalize(r) for r in gen_rows}

    return gold_set == gen_set

  def _create_mock_db(self) -> MagicMock:
    """
    Creates an in-memory mock `AsyncSession` for offline benchmark execution.

    Returns:
        MagicMock: Configured mock database session.
    """
    mock_db = MagicMock()
    db_store: list[Any] = []

    def mock_add(obj: object) -> None:
      """
      Appends an ORM object to the in-memory mock session store.

      Args:
          obj (object): ORM instance to store.
      """
      db_store.append(obj)

    mock_db.add.side_effect = mock_add

    async def mock_flush() -> None:
      """
      Populates UUIDs and default flags on pending objects in `db_store`.
      """
      for obj in db_store:
        if not getattr(obj, "id", None):
          obj.id = uuid.uuid4()
        if isinstance(obj, ModelCandidate) and getattr(obj, "is_selected", None) is None:
          obj.is_selected = False

    mock_db.flush = AsyncMock(side_effect=mock_flush)
    mock_db.commit = AsyncMock(side_effect=mock_flush)

    async def mock_refresh(instance: ExperimentLog | ModelCandidate) -> None:
      """
      Populates `id`, `created_at`, and `candidates` relationship on `instance`.

      Args:
          instance (ExperimentLog | ModelCandidate): ORM model instance being refreshed.
      """
      if not instance.id:
        instance.id = uuid.uuid4()
      if not getattr(instance, "created_at", None):
        setattr(instance, "created_at", datetime.now(UTC))

      if isinstance(instance, ExperimentLog):
        instance.candidates = [
          c for c in db_store if isinstance(c, ModelCandidate) and getattr(c, "experiment_id", None) == instance.id
        ]

    mock_db.refresh = AsyncMock(side_effect=mock_refresh)
    return mock_db

  async def _evaluate_strategy_case(
    self,
    case: dict[str, Any],
    strategy: str,
    gold_rows: list[Any] | None,
    mock_db: MagicMock,
    mock_user: User,
  ) -> list[dict[str, Any]]:
    """
    Runs a single benchmark case for a given prompt strategy and evaluates candidate SQLs.

    Args:
        case (dict[str, Any]): Gold benchmark test case dictionary.
        strategy (str): Strategy identifier string.
        gold_rows (list[Any] | None): Ground truth SQL result rows.
        mock_db (MagicMock): Mock database session.
        mock_user (User): Mock benchmark user.

    Returns:
        list[dict[str, Any]]: List of evaluation result rows for this case and strategy.
    """
    rows_out: list[dict[str, Any]] = []
    experiment = await sql_generator.run_arena_experiment(
      user_query=case["question"], db=mock_db, user=mock_user, strategy=strategy, dry_run=self.dry_run
    )

    for candidate in experiment.candidates:
      gen_sql = candidate.generated_sql
      gen_rows, gen_err = self._execute_sql(gen_sql)
      is_correct = self._compare_results(gold_rows, gen_rows) if not gen_err else False

      rows_out.append(
        {
          "Timestamp": datetime.now().isoformat(),
          "Theme": case["theme"],
          "Complexity": case["complexity"],
          "Strategy": strategy,
          "Model": candidate.model_tag,
          "LatencyMs": candidate.latency_ms,
          "Success": is_correct,
          "ExecError": bool(gen_err),
          "ErrorMsg": gen_err or "",
          "SQLHash": getattr(candidate, "sql_hash", "") or "",
          "GeneratedSQL": gen_sql.replace("\n", " ")[:100],
        }
      )
    return rows_out

  async def run(self, strategies: list[str]) -> None:
    """
    Main execution loop.

    Args:
        strategies: List of strategies to test (e.g. ['zero-shot', 'rag-few-shot']).
    """
    results_log: list[dict[str, Any]] = []
    mock_user = User(email="benchmarker@pulse.com", hashed_password="x")
    mock_user.id = uuid.uuid4()
    mock_db = self._create_mock_db()

    total_cases = len(self.dataset) * len(strategies)
    logger.info(
      f"🚀 Starting Benchmark: {len(self.dataset)} questions x {len(strategies)} strategies = {total_cases} passes"
    )

    for case in self.dataset:
      theme = case["theme"]
      gold_rows, gold_err = self._execute_sql(case["gold_sql"])
      if gold_err:
        logger.error(f"❌ Gold SQL Failed for '{theme}': {gold_err}")
        continue

      for strategy in strategies:
        logger.info(f"   >> Processing '{theme}' with {strategy}...")
        try:
          case_rows = await self._evaluate_strategy_case(case, strategy, gold_rows, mock_db, mock_user)
          results_log.extend(case_rows)
        except Exception as e:
          logger.error(f"Error in benchmark loop: {e}")
          traceback.print_exc()

    self._save_report(results_log)

  def _save_report(self, results: list[dict[str, Any]]) -> None:
    """
    Writes the results to a CSV file.

    Args:
        results: List of result dictionaries.
    """
    if not results:
      logger.warning("No results to save.")
      return

    with open(self.output_file, "w", newline="", encoding="utf-8") as f:
      writer = csv.DictWriter(f, fieldnames=results[0].keys())
      writer.writeheader()
      writer.writerows(results)

    logger.info(f"✅ Benchmark Complete. Report saved to {self.output_file}")

    # Print simple summary
    success_count = sum(1 for r in results if r["Success"])
    total = len(results)
    print(f"\nOverall Accuracy: {(success_count / total) * 100:.1f}% ({success_count}/{total})")


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

  if sys.platform == "win32":  # pragma: no cover
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

  runner = BenchmarkRunner(dry_run=args.dry_run, output_file=args.output)
  asyncio.run(runner.run(strategies=args.strategies))


if __name__ == "__main__":
  main()
