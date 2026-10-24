"""API router for serving benchmark datasets and real-time execution progress telemetry."""

import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.routers.admin import require_admin
from app.core.result import unwrap_or_raise_http
from app.models.user import User
from app.services.benchmark_telemetry_service import (
  DATA_DIR,
  BenchmarkTelemetryService,
  benchmark_telemetry_service,
  read_benchmark_json_file as _read_json_file,
  update_benchmark_progress,
)

router = APIRouter()


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


@router.get("/sql", response_model=list[dict[str, Any]])
async def get_sql_benchmarks() -> list[dict[str, Any]]:
  """
  Returns the gold standard text-to-SQL benchmarks.

  Returns:
      list[dict[str, Any]]: Parsed benchmark list from benchmark_gold.json.
  """
  file_path = Path(DATA_DIR) / "benchmark_gold.json"
  res = await asyncio.to_thread(_read_json_file, file_path, "SQL benchmarks not found.")
  return unwrap_or_raise_http(res)


@router.get("/mpax", response_model=list[dict[str, Any]])
async def get_mpax_benchmarks() -> list[dict[str, Any]]:
  """
  Returns the generated MPAX what-if scenarios.

  Returns:
      list[dict[str, Any]]: Parsed MPAX benchmark scenario items.
  """
  file_path = Path(DATA_DIR) / "mpax_benchmark_scenarios.json"
  res = await asyncio.to_thread(_read_json_file, file_path, "MPAX benchmarks not found.")
  return unwrap_or_raise_http(res)


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
async def stream_benchmark_progress(poll_interval_seconds: float = 0.0) -> StreamingResponse:
  """
  Server-Sent Events (SSE) endpoint providing real-time telemetry on active benchmark runs.

  Args:
      poll_interval_seconds (float): Optional delay after emitting a telemetry frame.

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
    if poll_interval_seconds > 0:
      await asyncio.sleep(poll_interval_seconds)

  return StreamingResponse(
    progress_generator(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
  )


__all__ = [
  "DATA_DIR",
  "BenchmarkProgressUpdateRequest",
  "BenchmarkTelemetryService",
  "benchmark_telemetry_service",
  "get_mpax_benchmarks",
  "get_sql_benchmarks",
  "post_benchmark_progress",
  "router",
  "stream_benchmark_progress",
  "update_benchmark_progress",
]
