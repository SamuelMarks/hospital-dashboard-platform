"""
Tests for the FastAPI root endpoint handler and CORS middleware behavior.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app, root


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
