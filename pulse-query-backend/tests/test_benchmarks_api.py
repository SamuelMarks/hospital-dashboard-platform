"""Tests for benchmarks API router."""

from unittest.mock import MagicMock, mock_open, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.main import app
from app.models.user import User

BASE_URL = "http://testserver/api/v1/benchmarks"


@pytest.mark.asyncio
async def test_get_sql_benchmarks_success() -> None:
  """Verify `GET /sql` returns parsed SQL benchmark items."""
  mock_data = '[{"theme": "test"}]'
  with (
    patch("app.api.routers.benchmarks.Path.exists", return_value=True),
    patch("builtins.open", mock_open(read_data=mock_data)),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/sql")
      assert response.status_code == 200
      assert response.json() == [{"theme": "test"}]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_not_found() -> None:
  """Verify `GET /sql` returns 404 when benchmark file is missing."""
  with patch("app.api.routers.benchmarks.Path.exists", return_value=False):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/sql")
      assert response.status_code == 404
      assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_read_error() -> None:
  """Verify `GET /sql` returns 500 when reading the benchmark file raises an error."""
  with (
    patch("app.api.routers.benchmarks.Path.exists", return_value=True),
    patch("builtins.open", side_effect=Exception("Read error")),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/sql")
      assert response.status_code == 500
      assert "Read error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_success() -> None:
  """Verify `GET /mpax` returns parsed MPAX benchmark scenario items."""
  mock_data = '[{"scenario": "test"}]'
  with (
    patch("app.api.routers.benchmarks.Path.exists", return_value=True),
    patch("builtins.open", mock_open(read_data=mock_data)),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/mpax")
      assert response.status_code == 200
      assert response.json() == [{"scenario": "test"}]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_not_found() -> None:
  """Verify `GET /mpax` returns 404 when scenario file is missing."""
  with patch("app.api.routers.benchmarks.Path.exists", return_value=False):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/mpax")
      assert response.status_code == 404
      assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_read_error() -> None:
  """Verify `GET /mpax` returns 500 when reading the scenario file raises an error."""
  with (
    patch("app.api.routers.benchmarks.Path.exists", return_value=True),
    patch("builtins.open", side_effect=Exception("Read error")),
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
  finally:
    app.dependency_overrides.pop(get_current_user, None)
