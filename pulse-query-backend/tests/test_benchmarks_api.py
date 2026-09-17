from unittest.mock import mock_open, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

BASE_URL = "http://testserver/api/v1/benchmarks"


@pytest.mark.asyncio
async def test_get_sql_benchmarks_success():
  mock_data = '[{"theme": "test"}]'
  with patch("app.api.routers.benchmarks.Path.exists", return_value=True):
    with patch("builtins.open", mock_open(read_data=mock_data)):
      async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
        response = await client.get("/sql")
        assert response.status_code == 200
        assert response.json() == [{"theme": "test"}]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_not_found():
  with patch("app.api.routers.benchmarks.Path.exists", return_value=False):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/sql")
      assert response.status_code == 404
      assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_sql_benchmarks_read_error():
  with patch("app.api.routers.benchmarks.Path.exists", return_value=True):
    with patch("builtins.open", side_effect=Exception("Read error")):
      async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
        response = await client.get("/sql")
        assert response.status_code == 500
        assert "Read error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_success():
  mock_data = '[{"scenario": "test"}]'
  with patch("app.api.routers.benchmarks.Path.exists", return_value=True):
    with patch("builtins.open", mock_open(read_data=mock_data)):
      async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
        response = await client.get("/mpax")
        assert response.status_code == 200
        assert response.json() == [{"scenario": "test"}]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_not_found():
  with patch("app.api.routers.benchmarks.Path.exists", return_value=False):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.get("/mpax")
      assert response.status_code == 404
      assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_mpax_benchmarks_read_error():
  with patch("app.api.routers.benchmarks.Path.exists", return_value=True):
    with patch("builtins.open", side_effect=Exception("Read error")):
      async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
        response = await client.get("/mpax")
        assert response.status_code == 500
        assert "Read error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_stream_benchmark_progress():
  from app.api.routers.benchmarks import update_benchmark_progress

  update_benchmark_progress(
    active=True,
    completed=5,
    total=10,
    current_model="gemini-1.5",
    current_status="running",
    eta_seconds=30,
  )

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.get("/progress")
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "data: {" in response.text
    assert '"completed": 5' in response.text
    assert '"total": 10' in response.text
    assert '"current_model": "gemini-1.5"' in response.text
