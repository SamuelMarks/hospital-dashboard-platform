"""
Benchmark Dataset and Real-Time Execution Progress Telemetry Service.

Encapsulates thread-safe benchmark execution telemetry state (`BenchmarkTelemetryService`)
and dataset file loading (`benchmark_gold.json` and `optimization_benchmarks.json`).
"""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.config import BACKEND_ROOT
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject

DATA_DIR = BACKEND_ROOT / "data"


class BenchmarkScenarioSchema(BaseModel):
  """
  Strongly typed Pydantic schema for a Text-to-SQL or Hospital Optimization benchmark scenario entry.

  Attributes:
      id (str | None): Optional scenario UUID or slug string.
      use_case (str | None): Optimization use case (`'service_unit'`, `'surgical_scheduling'`, `'staffing_optimization'`).
      institution_id (str | None): Partner hospital profile identifier.
      theme (str | None): Analytical or clinical optimization theme name.
      question (str | None): Natural language clinical question (SQL benchmark).
      gold_sql (str | None): Ground-truth DuckDB SQL query (SQL benchmark).
      complexity (str | None): Complexity tier (`'Low'`, `'Medium'`, `'High'`, `'Easy'`, `'Hard'`).
      prompt (str | None): Natural language scenario prompt (Optimization benchmark).
      scenario (str | None): Optional scenario identifier or summary label.
      expected_constraints_json (JsonObject | None): Gold-standard extracted constraint payload.
      expert_baseline_metrics (dict[str, float] | None): Expert-attained DES baseline metrics for scoring.
      demand_data (list[JsonObject] | None): Optional clinical service demand objects.
      base_capacity (dict[str, float] | None): Optional unit capacity dictionary.
      expected_metrics (dict[str, float] | None): Optional expected metrics dictionary.
  """

  model_config = ConfigDict(extra="allow")

  id: str | None = None
  use_case: str | None = None
  institution_id: str | None = None
  theme: str | None = None
  question: str | None = None
  gold_sql: str | None = None
  complexity: str | None = None
  prompt: str | None = None
  scenario: str | None = None
  expected_constraints_json: JsonObject | None = None
  expert_baseline_metrics: dict[str, float] | None = None
  demand_data: list[JsonObject] | None = None
  base_capacity: dict[str, float] | None = None
  expected_metrics: dict[str, float] | None = None


SqlBenchmarkEntry = BenchmarkScenarioSchema
OptimizationBenchmarkScenarioEntry = BenchmarkScenarioSchema


class BenchmarkTelemetryStateDict(TypedDict):
  """
  Typed dictionary representing real-time benchmark execution progress state.

  Attributes:
      active (bool): Whether a benchmark run is currently executing.
      completed (int): Number of benchmark scenarios completed.
      total (int): Total number of scenarios in the test matrix.
      current_model (str): Currently evaluated LLM model tag.
      status (str): Current execution phase description.
      eta_seconds (int): Estimated remaining seconds to completion.
  """

  active: bool
  completed: int
  total: int
  current_model: str
  status: str
  eta_seconds: int


class BenchmarkTelemetryService:
  """
  Encapsulated service managing thread-safe benchmark execution telemetry state.
  """

  def __init__(self) -> None:
    """Initializes the telemetry state dictionary and synchronization lock."""
    self._lock = Lock()
    self._state: BenchmarkTelemetryStateDict = {
      "active": False,
      "completed": 0,
      "total": 0,
      "current_model": "",
      "status": "idle",
      "eta_seconds": 0,
    }

  @property
  def state(self) -> BenchmarkTelemetryStateDict:
    """
    Returns a thread-safe snapshot copy of the current telemetry state dictionary.

    Returns:
        BenchmarkTelemetryStateDict: Copy of current benchmark execution progress state.
    """
    with self._lock:
      return {
        "active": self._state["active"],
        "completed": self._state["completed"],
        "total": self._state["total"],
        "current_model": self._state["current_model"],
        "status": self._state["status"],
        "eta_seconds": self._state["eta_seconds"],
      }

  def update(
    self,
    active: bool,
    completed: int,
    total: int,
    current_model: str,
    current_status: str,
    eta_seconds: int = 0,
  ) -> None:
    """
    Atomically updates benchmark execution progress metrics.

    Args:
        active (bool): Whether a benchmark run is currently executing.
        completed (int): Number of benchmark scenarios completed.
        total (int): Total number of scenarios in the test matrix.
        current_model (str): Currently evaluated LLM model tag.
        current_status (str): Current execution phase description.
        eta_seconds (int): Estimated remaining seconds to completion.
    """
    with self._lock:
      self._state["active"] = active
      self._state["completed"] = completed
      self._state["total"] = total
      self._state["current_model"] = current_model
      self._state["status"] = current_status
      self._state["eta_seconds"] = eta_seconds

  def reset(self) -> None:
    """
    Atomically resets benchmark execution telemetry back to the idle state.
    """
    self.update(
      active=False,
      completed=0,
      total=0,
      current_model="",
      current_status="idle",
      eta_seconds=0,
    )

  def snapshot_json(self) -> str:
    """
    Returns a thread-safe JSON snapshot of the current benchmark progress state.

    Returns:
        str: JSON-serialized telemetry state.
    """
    with self._lock:
      return json.dumps(self._state)


benchmark_telemetry_service = BenchmarkTelemetryService()


def update_benchmark_progress(
  active: bool,
  completed: int,
  total: int,
  current_model: str,
  current_status: str,
  eta_seconds: int = 0,
) -> None:
  """
  Updates benchmark execution progress for SSE broadcasting via `benchmark_telemetry_service`.

  Args:
      active (bool): Whether a benchmark run is currently executing.
      completed (int): Number of benchmark scenarios completed.
      total (int): Total number of scenarios in the test matrix.
      current_model (str): Currently evaluated LLM model tag.
      current_status (str): Current execution phase description.
      eta_seconds (int): Estimated remaining seconds to completion.
  """
  benchmark_telemetry_service.update(
    active=active,
    completed=completed,
    total=total,
    current_model=current_model,
    current_status=current_status,
    eta_seconds=eta_seconds,
  )


def read_benchmark_json_file(
  file_path: Path,
  not_found_message: str | None = None,
) -> AppResult[list[BenchmarkScenarioSchema]]:
  """
  Reads and parses a JSON benchmark file from disk, returning an explicit `AppResult`.

  Args:
      file_path (Path): Path to the JSON dataset file.
      not_found_message (str | None): Optional custom 404 detail message.

  Returns:
      AppResult[list[BenchmarkScenarioSchema]]: `Ok(records)` on success, or `Err(AppError)` on failure.
  """
  if not file_path.exists():
    return Err(
      AppError(
        code=ErrorCode.RESOURCE_NOT_FOUND,
        message=not_found_message or f"Benchmarks file not found: {file_path.name}",
        status_code=404,
      )
    )
  try:
    with open(file_path, encoding="utf-8") as f:
      raw_data: list[JsonObject] = json.load(f)
      validated = [BenchmarkScenarioSchema.model_validate(item) for item in raw_data]
      return Ok(validated)
  except (OSError, json.JSONDecodeError, ValidationError, TypeError, ValueError) as e:
    return Err(
      AppError(
        code=ErrorCode.IO_ERROR,
        message=f"Error reading benchmarks: {e!s}",
        status_code=500,
      )
    )
