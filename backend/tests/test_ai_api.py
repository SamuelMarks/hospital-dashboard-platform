"""
Tests for the AI API Router.

Verifies the integration of the SQLGeneratorService within the FastAPI application.
Ensures authentication is enforced and errors are handled gracefully.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user  # Import the dependency function

# Common constants
BASE_URL = "http://test"
AI_ENDPOINT = "/api/v1/ai/generate"


@pytest.mark.anyio
async def test_generate_sql_success() -> None:
  """
  Test the happy path for Text-to-SQL generation.
  Should return a 200 OK with the SQL string.
  """
  mock_prompt = "Show me all patients"
  mock_sql = "SELECT * FROM patients"

  # Mock the internal service to avoid calling actual LLM
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    mock_service.generate_sql = AsyncMock(return_value=mock_sql)

    # Mock authentication (User must be logged in)
    mock_user = AsyncMock()
    # Correctly use the function object as the key
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": mock_prompt})

    assert response.status_code == 200
    data = response.json()
    assert data["sql"] == mock_sql

    # Verify the service was called with the correct prompt
    mock_service.generate_sql.assert_called_once_with(mock_prompt)

  # Cleanup
  app.dependency_overrides = {}


@pytest.mark.anyio
async def test_generate_sql_empty_prompt() -> None:
  """
  Test that empty prompts are rejected with 400 Bad Request.
  """
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "   "})

  assert response.status_code == 400
  assert response.json()["detail"] == "Prompt cannot be empty."

  # Cleanup
  app.dependency_overrides = {}


@pytest.mark.anyio
async def test_generate_sql_unauthorized() -> None:
  """
  Test that the endpoint requires authentication.
  """
  # Ensure no overrides
  app.dependency_overrides = {}

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "test"})

  # FastAPI returns 401 for missing bearer token
  assert response.status_code == 401


@pytest.mark.anyio
async def test_generate_sql_timeout_error() -> None:
  """
  Test mapping of TimeoutError from service to 503 Service Unavailable.
  """
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    # Simulate a TimeoutError from the underlying LLM client
    mock_service.generate_sql = AsyncMock(side_effect=TimeoutError("LLM Timeout"))

    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "Complex query"})

    assert response.status_code == 503
    assert "timed out" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.anyio
async def test_generate_sql_generic_error() -> None:
  """
  Test general exception handling (500 Internal Server Error).
  """
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    mock_service.generate_sql = AsyncMock(side_effect=Exception("Unexpected failure"))

    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "Boom"})

    assert response.status_code == 500
    assert "Unexpected failure" in response.json()["detail"]

  app.dependency_overrides = {}
