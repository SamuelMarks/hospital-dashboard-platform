"""
Tests for the FastAPI root endpoint handler, static file serving, and CORS middleware behavior.
"""

from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest

from app.main import app, root, setup_static_files


def test_root_returns_health_message() -> None:
  """Root handler should return a simple health payload."""
  assert root() == {"message": "Hospital Analytics Platform API is running"}


@pytest.mark.asyncio
async def test_cors_preflight_allowed_origin() -> None:
  """Allowed origins should receive Access-Control-Allow-Origin and Credentials headers."""
  transport = ASGITransport(app=app)
  async with AsyncClient(transport=transport, base_url="http://test") as client:
    response = await client.options(
      "/",
      headers={
        "Origin": "http://localhost:4200",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:4200"
    assert response.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.asyncio
async def test_root_get_returns_health_message() -> None:
  """GET request to root endpoint should return health status message."""
  transport = ASGITransport(app=app)
  async with AsyncClient(transport=transport, base_url="http://test") as client:
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hospital Analytics Platform API is running"}


@pytest.mark.asyncio
async def test_debug_static_files_serving(tmp_path: Path) -> None:
  """Static files should be mounted and served over HTTP when DEBUG is set and dist path exists."""
  dummy_app = FastAPI()
  dist_dir = tmp_path / "browser"
  dist_dir.mkdir(parents=True, exist_ok=True)
  index_file = dist_dir / "index.html"
  index_file.write_text("<!doctype html><html><body><h1>Pulse Test</h1></body></html>", encoding="utf-8")

  with patch.dict("os.environ", {"DEBUG": "1"}):
    setup_static_files(dummy_app, dist_candidates=[dist_dir])

  async with AsyncClient(transport=ASGITransport(app=dummy_app), base_url="http://test") as client:
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "<h1>Pulse Test</h1>" in resp.text


@pytest.mark.asyncio
async def test_debug_static_files_missing_dist(tmp_path: Path) -> None:
  """Fallback to root JSON health handler when DEBUG is set but dist path does not exist."""
  dummy_app = FastAPI()
  missing_dir = tmp_path / "nonexistent_dist"

  with patch.dict("os.environ", {"DEBUG": "1"}):
    setup_static_files(dummy_app, dist_candidates=[missing_dir])

  async with AsyncClient(transport=ASGITransport(app=dummy_app), base_url="http://test") as client:
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"message": "Hospital Analytics Platform API is running"}


@pytest.mark.asyncio
async def test_cors_preflight_rejected_origin() -> None:
  """Unauthorized origins should not receive Access-Control-Allow-Origin header."""
  transport = ASGITransport(app=app)
  async with AsyncClient(transport=transport, base_url="http://test") as client:
    response = await client.options(
      "/",
      headers={
        "Origin": "http://malicious-external-site.com",
        "Access-Control-Request-Method": "GET",
      },
    )
    assert "access-control-allow-origin" not in response.headers
