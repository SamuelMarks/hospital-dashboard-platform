"""API router for serving benchmark datasets and real-time execution progress telemetry."""

import asyncio
from collections.abc import AsyncGenerator
import json
from pathlib import Path
from threading import Lock
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.routers.admin import require_admin
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.user import User

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"


class BenchmarkProgressUpdateRequest(BaseModel):
  """
  Request payload for updating active benchmark execution progress telemetry.
  """

  active: bool
  completed: int
  total: int
  current_model: str
  current_status: str
  eta_seconds: int = 0


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
    Returns the internal telemetry state dictionary.

    Returns:
        dict[str, Any]: Current benchmark execution progress state.
    """
    return self._state

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

  def snapshot_json(self) -> str:
    """
    Returns a thread-safe JSON snapshot of the current benchmark progress state.

    Returns:
        str: JSON-serialized telemetry state.
    """
    with self._lock:
      return json.dumps(self._state)


benchmark_telemetry_service = BenchmarkTelemetryService()
benchmark_progress_state: dict[str, Any] = benchmark_telemetry_service.state


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


def _read_json_file(file_path: Path) -> AppResult[list[dict[str, Any]]]:
  """
  Reads and parses a JSON benchmark file from disk, returning an explicit `AppResult`.

  Args:
      file_path (Path): Path to the JSON dataset file.

  Returns:
      AppResult[list[dict[str, Any]]]: `Ok(records)` on success, or `Err(AppError)` on failure.
  """
  if not file_path.exists():
    return Err(
      AppError(
        code=ErrorCode.RESOURCE_NOT_FOUND,
        message=f"Benchmarks file not found: {file_path.name}",
        status_code=status.HTTP_404_NOT_FOUND,
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
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      )
    )


@router.get("/sql", response_model=list[dict[str, Any]])
async def get_sql_benchmarks() -> list[dict[str, Any]]:
  """
  Returns the gold standard text-to-SQL benchmarks.

  Returns:
      list[dict[str, Any]]: Parsed benchmark list from benchmark_gold.json.

  Raises:
      HTTPException: 404 if file missing, 500 if reading or JSON parsing fails.
  """
  file_path = DATA_DIR / "benchmark_gold.json"
  res = await asyncio.to_thread(_read_json_file, file_path)
  if isinstance(res, Err):
    detail = "SQL benchmarks not found." if res.error.status_code == 404 else res.error.message
    raise HTTPException(status_code=res.error.status_code, detail=detail)
  return res.value


@router.get("/mpax", response_model=list[dict[str, Any]])
async def get_mpax_benchmarks() -> list[dict[str, Any]]:
  """
  Returns the generated MPAX what-if scenarios.

  Returns:
      list[dict[str, Any]]: Parsed MPAX benchmark scenario items.

  Raises:
      HTTPException: 404 if file missing, 500 if reading or JSON parsing fails.
  """
  file_path = DATA_DIR / "mpax_benchmark_scenarios.json"
  res = await asyncio.to_thread(_read_json_file, file_path)
  if isinstance(res, Err):
    detail = "MPAX benchmarks not found." if res.error.status_code == 404 else res.error.message
    raise HTTPException(status_code=res.error.status_code, detail=detail)
  return res.value


@router.post("/progress", response_model=dict[str, Any])
async def post_benchmark_progress(
  payload: BenchmarkProgressUpdateRequest,
  current_user: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
  """
  Updates the benchmark progress telemetry state (Admin only).

  Args:
      payload (BenchmarkProgressUpdateRequest): Telemetry progress fields.
      current_user (User): Authenticated administrator.

  Returns:
      dict[str, Any]: Updated telemetry state snapshot.
  """
  _ = current_user
  update_benchmark_progress(
    active=payload.active,
    completed=payload.completed,
    total=payload.total,
    current_model=payload.current_model,
    current_status=payload.current_status,
    eta_seconds=payload.eta_seconds,
  )
  return benchmark_telemetry_service.state


@router.get("/progress")
async def stream_benchmark_progress() -> StreamingResponse:
  """
  Server-Sent Events (SSE) endpoint providing real-time telemetry on active benchmark runs.

  Returns:
      StreamingResponse: SSE stream emitting live benchmark progress events.
  """

  async def progress_generator() -> AsyncGenerator[str, None]:
    """
    Asynchronous event generator yielding SSE messages.

    Yields:
        str: Serialized SSE data payload.
    """
    nl = chr(10)
    data_str = benchmark_telemetry_service.snapshot_json()
    yield f"data: {data_str}{nl}{nl}"
    await asyncio.sleep(0.01)

  return StreamingResponse(
    progress_generator(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
  )
