"""Tests for benchmarks API router."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import uuid

from httpx import ASGITransport, AsyncClient
import pytest

from app.api.deps import get_current_user
from app.api.routers import benchmarks as benchmarks_router
from app.main import app
from app.models.user import User

BASE_URL = "http://testserver/api/v1/benchmarks"


@pytest.mark.asyncio
async def test_get_sql_benchmarks_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `GET /sql` returns parsed SQL benchmark items from a real temporary JSON file."""
  gold_file = tmp_path / "benchmark_gold.json"
  gold_file.write_text(json.dumps([{"theme": "test", "question": "Count ICU", "gold_sql": "SELECT 1"}]), encoding="utf-8")
  monkeypatch.setattr(benchmarks_router, "DATA_DIR", tmp_path)

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/sql")
    assert response.status_code == 200
    assert response.json() == [{"theme": "test", "question": "Count ICU", "gold_sql": "SELECT 1"}]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_not_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `GET /sql` returns 404 when benchmark file is missing in `DATA_DIR`."""
  monkeypatch.setattr(benchmarks_router, "DATA_DIR", tmp_path)
  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/sql")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_read_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `GET /sql` returns 500 when the benchmark file contains malformed JSON."""
  gold_file = tmp_path / "benchmark_gold.json"
  gold_file.write_text("{malformed json", encoding="utf-8")
  monkeypatch.setattr(benchmarks_router, "DATA_DIR", tmp_path)
  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/sql")
    assert response.status_code == 500
    assert "Error reading benchmarks" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `GET /mpax` returns parsed MPAX benchmark scenario items from a real temporary JSON file."""
  mpax_file = tmp_path / "mpax_benchmark_scenarios.json"
  mpax_file.write_text(json.dumps([{"scenario": "test", "theme": "Capacity"}]), encoding="utf-8")
  monkeypatch.setattr(benchmarks_router, "DATA_DIR", tmp_path)

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/mpax")
    assert response.status_code == 200
    assert response.json() == [{"scenario": "test", "theme": "Capacity"}]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_not_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verify `GET /mpax` returns 404 when scenario file is missing in `DATA_DIR`."""
  monkeypatch.setattr(benchmarks_router, "DATA_DIR", tmp_path)
  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/mpax")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_read_error() -> None:
  """Verify `GET /mpax` returns 500 when reading the scenario file raises an OS error."""
  with (
    patch("app.api.routers.benchmarks.Path.exists", return_value=True),
    patch("builtins.open", side_effect=OSError("Read error")),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/mpax")
      assert response.status_code == 500
      assert "Read error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_post_and_stream_benchmark_progress() -> None:
  """Verify `POST /progress` requires admin privileges and `GET /progress` streams updated telemetry."""
  admin_user = MagicMock(spec=User)
  admin_user.id = uuid.uuid4()
  admin_user.is_admin = True
  admin_user.role = "SUPER_ADMIN"
  admin_user.language_preference = "en"

  non_admin = MagicMock(spec=User)
  non_admin.id = uuid.uuid4()
  non_admin.is_admin = False
  non_admin.role = "DATA_ANALYST"
  non_admin.language_preference = "en"

  try:
    app.dependency_overrides[get_current_user] = lambda: non_admin
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      res_forbidden = await client.post(
        "/progress",
        json={
          "active": True,
          "completed": 5,
          "total": 10,
          "current_model": "gemini-1.5",
          "current_status": "running",
          "eta_seconds": 30,
        },
      )
      assert res_forbidden.status_code == 403

    app.dependency_overrides[get_current_user] = lambda: admin_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      res_ok = await client.post(
        "/progress",
        json={
          "active": True,
          "completed": 5,
          "total": 10,
          "current_model": "gemini-1.5",
          "current_status": "running",
          "eta_seconds": 30,
        },
      )
      assert res_ok.status_code == 200
      assert res_ok.json()["completed"] == 5

      response = await client.get("/progress")
      assert response.status_code == 200
      assert "text/event-stream" in response.headers["content-type"]
      assert "data: {" in response.text
      assert '"completed": 5' in response.text
      assert '"total": 10' in response.text
      assert '"current_model": "gemini-1.5"' in response.text

      response_delayed = await client.get("/progress?poll_interval_seconds=0.001")
      assert response_delayed.status_code == 200
  finally:
    app.dependency_overrides.pop(get_current_user, None)


def test_benchmark_telemetry_service_reset_and_default_not_found() -> None:
  """Verify `BenchmarkTelemetryService.reset` and `read_benchmark_json_file` default 404 message."""
  from pathlib import Path

  from app.core.result import Err
  from app.services.benchmark_telemetry_service import (
    benchmark_telemetry_service,
    read_benchmark_json_file,
  )

  benchmark_telemetry_service.update(True, 3, 5, "m1", "running", 10)
  benchmark_telemetry_service.reset()
  assert benchmark_telemetry_service.state["active"] is False
  assert benchmark_telemetry_service.state["status"] == "idle"

  res = read_benchmark_json_file(Path("/nonexistent/custom_bench.json"))
  assert isinstance(res, Err)
  assert "custom_bench.json" in res.error.message
