"""
Tests for the AI API Router (Arena Edition).

Verifies the integration of the run_arena_experiment service within FastAPI.
"""

import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user
from app.schemas.feedback import ExperimentResponse, ModelCandidateResponse

# Common constants
BASE_URL = "http://test"
AI_ENDPOINT = "/api/v1/ai/generate"


@pytest.mark.asyncio
async def test_generate_sql_success() -> None:
  """
  Test the happy path for Text-to-SQL generation via Arena.
  Should return a 200 OK with the Experiment object containing candidates.
  """
  mock_prompt = "Show me all patients"

  # Create a mock ExperimentResponse reflecting what the service returns
  mock_exp = ExperimentResponse(
    id=uuid.uuid4(),
    user_id=uuid.uuid4(),
    created_at="2023-01-01T00:00:00Z",
    prompt_text=mock_prompt,
    candidates=[
      ModelCandidateResponse(
        id=uuid.uuid4(),
        experiment_id=uuid.uuid4(),
        model_tag="GPT-4o",
        generated_sql="SELECT * FROM patients",
        latency_ms=100,
        is_selected=False,
      )
    ],
  )

  # Mock the internal service
  # NOTE: The router now calls `run_arena_experiment`, not `generate_sql`
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    mock_service.run_arena_experiment = AsyncMock(return_value=mock_exp)

    # Mock authentication
    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": mock_prompt})

    assert response.status_code == 200
    data = response.json()

    assert data["prompt_text"] == mock_prompt
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["generated_sql"] == "SELECT * FROM patients"

    # Verify the service was called
    mock_service.run_arena_experiment.assert_called_once()

  # Cleanup
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_empty_prompt() -> None:
  """
  Test that empty prompts are rejected with 400.
  """
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "   "})

  assert response.status_code == 400
  assert "Prompt cannot be empty" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_unauthorized() -> None:
  """
  Test that the endpoint requires authentication.
  """
  app.dependency_overrides = {}
  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "test"})
  assert response.status_code == 401


@pytest.mark.asyncio
async def test_generate_sql_service_unavailable() -> None:
  """
  Test mapping of RuntimeError (e.g. no providers) to 503.
  """
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    mock_service.run_arena_experiment = AsyncMock(side_effect=RuntimeError("No LLM providers"))

    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "query"})

    assert response.status_code == 503
    assert "No LLM providers" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_generic_error() -> None:
  """
  Test general exception handling (500).
  """
  with patch("app.api.routers.ai.sql_generator") as mock_service:
    mock_service.run_arena_experiment = AsyncMock(side_effect=Exception("Unexpected failure"))

    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "Boom"})

    assert response.status_code == 500
    assert "Unexpected failure" in response.json()["detail"]

  app.dependency_overrides = {}
