"""API router for serving benchmark datasets and real-time execution progress telemetry."""

import asyncio
import json
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"

# Global state tracking active benchmark execution progress
benchmark_progress_state: dict[str, Any] = {
  "active": False,
  "completed": 0,
  "total": 0,
  "current_model": "",
  "status": "idle",
  "eta_seconds": 0,
}


def update_benchmark_progress(
  active: bool,
  completed: int,
  total: int,
  current_model: str,
  current_status: str,
  eta_seconds: int = 0,
) -> None:
  """
  Updates module-level benchmark execution progress for SSE broadcasting.

  Args:
      active (bool): Whether a benchmark run is currently executing.
      completed (int): Number of benchmark scenarios completed.
      total (int): Total number of scenarios in the test matrix.
      current_model (str): Currently evaluated LLM model tag.
      current_status (str): Current execution phase description.
      eta_seconds (int): Estimated remaining seconds to completion.
  """
  benchmark_progress_state["active"] = active
  benchmark_progress_state["completed"] = completed
  benchmark_progress_state["total"] = total
  benchmark_progress_state["current_model"] = current_model
  benchmark_progress_state["status"] = current_status
  benchmark_progress_state["eta_seconds"] = eta_seconds


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
  if not file_path.exists():
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SQL benchmarks not found.")

  try:
    with open(file_path, "r") as f:
      data = json.load(f)
      return data
  except Exception as e:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error reading benchmarks: {e!s}")


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
  if not file_path.exists():
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MPAX benchmarks not found.")

  try:
    with open(file_path, "r") as f:
      data = json.load(f)
      return data
  except Exception as e:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error reading benchmarks: {e!s}")


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
    data_str = json.dumps(benchmark_progress_state)
    yield f"data: {data_str}\n\n"
    await asyncio.sleep(0.01)

  return StreamingResponse(
    progress_generator(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
  )
