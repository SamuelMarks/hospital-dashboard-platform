"""
Tests for the AI API Router (Arena Edition).

Verifies the integration of the `run_arena_experiment` and `record_feedback_result`
services within FastAPI, including end-to-end database persistence.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core import security
from app.main import app
from app.models.feedback import ModelCandidate
from app.models.user import User
from app.schemas.feedback import ExperimentResponse, ModelCandidateResponse
from app.services.llm_client import ArenaResponse

BASE_URL = "http://test"
AI_ENDPOINT = "/api/v1/ai/generate"
AI_EXECUTE_ENDPOINT = "/api/v1/ai/execute"
AI_MODELS_ENDPOINT = "/api/v1/ai/models"


@pytest.mark.asyncio
async def test_list_available_models() -> None:
  """Verifies the GET /models endpoint successfully returns the list of available LLMs."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with (
    patch("app.api.routers.ai.llm_client.get_available_models") as mock_get,
    patch("app.api.routers.ai.get_admin_settings", return_value=None),
  ):
    mock_get.return_value = [{"id": "mock-m1", "name": "Mock Model 1", "provider": "openai", "is_local": False}]

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.get(AI_MODELS_ENDPOINT)

  assert response.status_code == 200
  data = response.json()
  assert len(data) == 1
  assert data[0]["id"] == "mock-m1"

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_list_available_models_all() -> None:
  """Verifies the GET /models endpoint successfully returns the list of available LLMs when show_all=true."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with (
    patch("app.api.routers.ai.llm_client.get_available_models") as mock_get,
    patch("app.api.routers.ai.get_admin_settings", return_value=None),
  ):
    mock_get.return_value = [{"id": "mock-m1", "name": "Mock Model 1", "provider": "openai", "is_local": False}]

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.get(f"{AI_MODELS_ENDPOINT}?show_all=true")

  assert response.status_code == 200

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_success() -> None:
  """Test the happy path for Text-to-SQL generation via Arena."""
  mock_prompt = "Show me all patients"

  mock_exp = ExperimentResponse(
    id=uuid.uuid4(),
    user_id=uuid.uuid4(),
    created_at=datetime(2023, 1, 1, tzinfo=UTC),
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

  with (
    patch.object(app.dependency_overrides.get(get_current_user, lambda: None), "__call__", create=True),
    patch("app.api.routers.ai.sql_generator.run_arena_experiment", new=AsyncMock(return_value=mock_exp)) as mock_run,
  ):
    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": mock_prompt})

    assert response.status_code == 200
    data = response.json()
    assert data["prompt_text"] == mock_prompt
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["generated_sql"] == "SELECT * FROM patients"
    mock_run.assert_called_once()

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_and_vote_experiment_candidate_persists_in_db(
  client: AsyncClient, db_session: AsyncSession
) -> None:
  """End-to-end test verifying `/api/v1/ai/generate` and `/vote` persist and update `ExperimentLog` and `ModelCandidate`."""
  user_a = User(
    email=f"arena_a_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  user_b = User(
    email=f"arena_b_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  db_session.add_all([user_a, user_b])
  await db_session.commit()

  app.dependency_overrides[get_current_user] = lambda: user_a
  try:
    with patch(
      "app.services.sql_generator.llm_client.generate_arena_competition",
      new=AsyncMock(
        return_value=[
          ArenaResponse("GPT-4o", "openai/gpt-4o", "```sql\nSELECT 1 AS c\n```", 45, None),
          ArenaResponse("Claude 3", "anthropic/claude-3", "```sql\nSELECT 2 AS c\n```", 55, None),
        ]
      ),
    ):
      gen_res = await client.post(AI_ENDPOINT, json={"prompt": "Count patients in ICU"})

    assert gen_res.status_code == 200
    exp_data = gen_res.json()
    exp_id = exp_data["id"]
    assert len(exp_data["candidates"]) == 2
    cand1_id = exp_data["candidates"][0]["id"]
    cand2_id = exp_data["candidates"][1]["id"]

    # Vote for candidate 1 with execution telemetry
    vote_res = await client.post(
      f"/api/v1/ai/experiments/{exp_id}/candidates/{cand1_id}/vote",
      json={"is_selected": True, "execution_success": True, "error_message": None},
    )
    assert vote_res.status_code == 200
    voted_cands = {c["id"]: c for c in vote_res.json()["candidates"]}
    assert voted_cands[cand1_id]["is_selected"] is True
    assert voted_cands[cand1_id]["execution_success"] is True
    assert voted_cands[cand2_id]["is_selected"] is False

    # Verify DB persistence directly
    db_cand1 = (
      (await db_session.execute(select(ModelCandidate).where(ModelCandidate.id == uuid.UUID(cand1_id)))).scalars().first()
    )
    assert db_cand1 is not None
    assert db_cand1.is_selected is True
    assert db_cand1.execution_success is True

    # Vote with error_message and is_selected=False
    unvote_res = await client.post(
      f"/api/v1/ai/experiments/{exp_id}/candidates/{cand2_id}/vote",
      json={"is_selected": False, "execution_success": False, "error_message": "Binder Error"},
    )
    assert unvote_res.status_code == 200
    unvoted_cands = {c["id"]: c for c in unvote_res.json()["candidates"]}
    assert unvoted_cands[cand2_id]["is_selected"] is False
    assert unvoted_cands[cand2_id]["execution_success"] is False
    assert unvoted_cands[cand2_id]["error_message"] == "Binder Error"

    # Vote with only is_selected=True (execution_success=None, error_message=None)
    re_vote_res = await client.post(
      f"/api/v1/ai/experiments/{exp_id}/candidates/{cand1_id}/vote",
      json={"is_selected": True},
    )
    assert re_vote_res.status_code == 200

    # Missing candidate in experiment returns 404
    missing_cand_res = await client.post(
      f"/api/v1/ai/experiments/{exp_id}/candidates/{uuid.uuid4()}/vote",
      json={"is_selected": True},
    )
    assert missing_cand_res.status_code == 404

    # User B cannot vote on User A's experiment (returns 404)
    app.dependency_overrides[get_current_user] = lambda: user_b
    cross_user_res = await client.post(
      f"/api/v1/ai/experiments/{exp_id}/candidates/{cand1_id}/vote",
      json={"is_selected": True},
    )
    assert cross_user_res.status_code == 404
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_execute_sql_empty_prompt() -> None:
  """Empty SQL should return 400."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_EXECUTE_ENDPOINT, json={"sql": "  "})

  assert response.status_code == 400
  assert "SQL cannot be empty" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_execute_sql_success() -> None:
  """Execute SQL should return data on success."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_conn = MagicMock()
  mock_cursor = MagicMock()
  mock_conn.cursor.return_value = mock_cursor

  payload = {"data": [{"x": 1}], "columns": ["x"], "error": None}

  with (
    patch("app.api.routers.ai.duckdb_manager.get_readonly_connection", return_value=mock_conn),
    patch("app.api.routers.ai.run_sql_widget", return_value=payload),
  ):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_EXECUTE_ENDPOINT, json={"sql": "SELECT 1"})

  assert response.status_code == 200
  assert response.json()["data"] == [{"x": 1}]
  mock_conn.close.assert_called_once()

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_execute_sql_handles_exception() -> None:
  """Execution errors should be returned in response payload."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch("app.api.routers.ai.duckdb_manager.get_readonly_connection", side_effect=RuntimeError("boom")):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_EXECUTE_ENDPOINT, json={"sql": "SELECT 1"})

  assert response.status_code == 200
  assert "boom" in (response.json().get("error") or "")

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_empty_prompt() -> None:
  """Test that empty prompts are rejected with 400."""
  mock_user = AsyncMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "   "})

  assert response.status_code == 400
  assert "Prompt cannot be empty" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_unauthorized() -> None:
  """Test that the endpoint requires authentication."""
  app.dependency_overrides = {}
  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.post(AI_ENDPOINT, json={"prompt": "test"})
  assert response.status_code == 401


@pytest.mark.asyncio
async def test_generate_sql_service_unavailable() -> None:
  """Test mapping of RuntimeError (e.g. no providers) to 503."""
  with patch(
    "app.api.routers.ai.sql_generator.run_arena_experiment",
    new=AsyncMock(side_effect=RuntimeError("No LLM providers")),
  ):
    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "query"})

    assert response.status_code == 503
    assert "No LLM providers" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_generate_sql_generic_error() -> None:
  """Test general exception handling (500)."""
  with patch(
    "app.api.routers.ai.sql_generator.run_arena_experiment",
    new=AsyncMock(side_effect=Exception("Unexpected failure")),
  ):
    mock_user = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.post(AI_ENDPOINT, json={"prompt": "Boom"})

    assert response.status_code == 500
    assert "Unexpected failure" in response.json()["detail"]

  app.dependency_overrides = {}
