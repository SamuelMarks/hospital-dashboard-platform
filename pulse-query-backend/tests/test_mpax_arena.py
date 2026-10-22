"""Tests for MPAX Arena API Router and end-to-end persistence."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core import security
from app.core.result import AppError, Err, ErrorCode, Ok
from app.main import app
from app.models.mpax_arena import MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaCandidate, MpaxArenaResponse
from app.services.llm_client import ArenaResponse

BASE_URL = "http://testserver/api/v1/mpax_arena"


@pytest.fixture
def mock_user() -> User:
  """
  Creates a mock `User` instance for router dependency injection.

  Returns:
      User: Mocked user instance.
  """
  user = MagicMock(spec=User)
  user.id = uuid.uuid4()
  user.email = "test@example.com"
  return user


@pytest.fixture
def mock_mpax_service() -> Generator[AsyncMock, None, None]:
  """
  Patches `mpax_arena_service.run_mpax_arena_result` for isolated router error-mapping tests.

  Yields:
      AsyncMock: Patched `run_mpax_arena_result` coroutine mock.
  """
  with patch(
    "app.api.routers.mpax_arena.mpax_arena_service.run_mpax_arena_result",
    new_callable=AsyncMock,
  ) as mock_run:
    mock_run.return_value = Ok(MpaxArenaResponse(experiment_id="test-exp", mode="judge", candidates=[]))
    yield mock_run


@pytest.mark.asyncio
async def test_run_mpax_arena_end_to_end_persistence(client: AsyncClient, db_session: AsyncSession) -> None:
  """Verifies `/api/v1/mpax_arena/run` and `/vote` execute `MpaxArenaService` and persist `MpaxArenaRun` in DB."""
  user = User(
    email=f"mpax_e2e_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()

  app.dependency_overrides[get_current_user] = lambda: user
  try:
    with patch(
      "app.services.mpax_arena_service.llm_client.generate_arena_competition",
      new=AsyncMock(return_value=[ArenaResponse("GPT-4o", "openai/gpt-4o", "Recommended ICU allocation", 15, None)]),
    ):
      res = await client.post(
        "/api/v1/mpax_arena/run",
        json={
          "prompt": "Route 10 Cardiology patients",
          "mode": "judge",
          "demand_sql": "SELECT 'Cardiology' AS svc, 10 AS cnt",
          "base_capacity": {"ICU": 15.0},
        },
      )
    assert res.status_code == 200
    body = res.json()
    run_id = body["experiment_id"]
    assert len(body["candidates"]) >= 1
    cand_id = body["candidates"][0]["id"]

    # Verify MpaxArenaRun is persisted in DB
    db_run = (
      (await db_session.execute(select(MpaxArenaRun).where(MpaxArenaRun.id == uuid.UUID(run_id)))).scalars().first()
    )
    assert db_run is not None
    assert db_run.mode == "judge"

    # Vote on candidate via router
    vote_res = await client.post(f"/api/v1/mpax_arena/runs/{run_id}/candidates/{cand_id}/vote")
    assert vote_res.status_code == 200
    assert vote_res.json()["candidates"][0]["is_selected"] is True
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_run_mpax_arena_success(mock_user: User, mock_mpax_service: AsyncMock) -> None:
  """
  Verifies `POST /run` delegates to `mpax_arena_service.run_mpax_arena_result` and returns 200.

  Args:
      mock_user (User): Authenticated user fixture.
      mock_mpax_service (AsyncMock): Patched service fixture.
  """
  _ = mock_mpax_service
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "Test prompt", "mode": "judge"})

  assert response.status_code == 200
  assert response.json()["experiment_id"] == "test-exp"
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_prompt(mock_user: User) -> None:
  """
  Verifies `POST /run` rejects whitespace-only prompts with 400.

  Args:
      mock_user (User): Authenticated user fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "  ", "mode": "judge"})

  assert response.status_code == 400
  assert "Prompt cannot be empty" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_mode(mock_user: User) -> None:
  """
  Verifies `POST /run` rejects empty mode strings with 400.

  Args:
      mock_user (User): Authenticated user fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": ""})

  assert response.status_code == 400
  assert "Mode must be specified" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_value_error(mock_user: User, mock_mpax_service: AsyncMock) -> None:
  """
  Verifies `POST /run` maps `Err(MPAX_INVALID_MODE)` from service to 400 Bad Request.

  Args:
      mock_user (User): Authenticated user fixture.
      mock_mpax_service (AsyncMock): Patched service fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user
  mock_mpax_service.return_value = Err(
    AppError(code=ErrorCode.MPAX_INVALID_MODE, message="Invalid mode", status_code=400)
  )

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": "invalid"})

  assert response.status_code == 400
  assert "Invalid mode" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_internal_error(mock_user: User, mock_mpax_service: AsyncMock) -> None:
  """
  Verifies `POST /run` maps `Err(INTERNAL_ERROR)` to 500 Internal Server Error.

  Args:
      mock_user (User): Authenticated user fixture.
      mock_mpax_service (AsyncMock): Patched service fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user
  mock_mpax_service.return_value = Err(
    AppError(code=ErrorCode.INTERNAL_ERROR, message="MPAX Arena failed: Boom", status_code=500)
  )

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": "judge"})

  assert response.status_code == 500
  assert "Boom" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_vote_mpax_arena_candidate_success(mock_user: User) -> None:
  """
  Verifies `POST /runs/{id}/candidates/{cid}/vote` returns 200 on success.

  Args:
      mock_user (User): Authenticated user fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch(
    "app.api.routers.mpax_arena.mpax_arena_service.vote_candidate_result",
    new_callable=AsyncMock,
  ) as mock_vote:
    mock_vote.return_value = Ok(
      MpaxArenaResponse(
        experiment_id="exp-1",
        mode="judge",
        candidates=[MpaxArenaCandidate(id="cand-1", model_name="m1", content="sql", is_selected=True)],
      )
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.post("/runs/exp-1/candidates/cand-1/vote")

    assert response.status_code == 200
    assert response.json()["candidates"][0]["is_selected"] is True

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_vote_mpax_arena_candidate_not_found(mock_user: User) -> None:
  """
  Verifies `POST /runs/{id}/candidates/{cid}/vote` maps `Err(MPAX_CANDIDATE_NOT_FOUND)` to 404 Not Found.

  Args:
      mock_user (User): Authenticated user fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch(
    "app.api.routers.mpax_arena.mpax_arena_service.vote_candidate_result",
    new_callable=AsyncMock,
  ) as mock_vote:
    mock_vote.return_value = Err(
      AppError(code=ErrorCode.MPAX_CANDIDATE_NOT_FOUND, message="Candidate not found", status_code=404)
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.post("/runs/exp-1/candidates/cand-1/vote")

    assert response.status_code == 404
    assert "Candidate not found" in response.json()["detail"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_vote_mpax_arena_candidate_internal_error(mock_user: User) -> None:
  """
  Verifies `POST /runs/{id}/candidates/{cid}/vote` maps `Err(INTERNAL_ERROR)` to 500.

  Args:
      mock_user (User): Authenticated user fixture.
  """
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch(
    "app.api.routers.mpax_arena.mpax_arena_service.vote_candidate_result",
    new_callable=AsyncMock,
  ) as mock_vote:
    mock_vote.return_value = Err(AppError(code=ErrorCode.INTERNAL_ERROR, message="DB down", status_code=500))

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
      response = await client.post("/runs/exp-1/candidates/cand-1/vote")

    assert response.status_code == 500
    assert "DB down" in response.json()["detail"]

  app.dependency_overrides = {}
