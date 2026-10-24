"""
Benchmark Dataset and Real-Time Execution Progress Telemetry Service.

Encapsulates thread-safe benchmark execution telemetry state (`BenchmarkTelemetryService`)
and dataset file loading (`benchmark_gold.json` and `mpax_benchmark_scenarios.json`).
"""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.config import BACKEND_ROOT
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok

DATA_DIR = BACKEND_ROOT / "data"


class BenchmarkTelemetryService:
  """
  Encapsulated service managing thread-safe benchmark execution telemetry state.
  """

  def __init__(self) -> None:
    """Initializes the telemetry state dictionary and synchronization lock."""
    self._lock = Lock()
    self._state: dict[str, Any] = {
      "active": False,
      "completed": 0,
      "total": 0,
      "current_model": "",
      "status": "idle",
      "eta_seconds": 0,
    }

  @property
  def state(self) -> dict[str, Any]:
    """
    Returns a thread-safe snapshot copy of the current telemetry state dictionary.

    Returns:
        dict[str, Any]: Copy of current benchmark execution progress state.
    """
    with self._lock:
      return dict(self._state)

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
) -> AppResult[list[dict[str, Any]]]:
  """
  Reads and parses a JSON benchmark file from disk, returning an explicit `AppResult`.

  Args:
      file_path (Path): Path to the JSON dataset file.
      not_found_message (str | None): Optional custom 404 detail message.

  Returns:
      AppResult[list[dict[str, Any]]]: `Ok(records)` on success, or `Err(AppError)` on failure.
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
      data: list[dict[str, Any]] = json.load(f)
      return Ok(data)
  except Exception as e:
    return Err(
      AppError(
        code=ErrorCode.IO_ERROR,
        message=f"Error reading benchmarks: {e!s}",
        status_code=500,
      )
    )
