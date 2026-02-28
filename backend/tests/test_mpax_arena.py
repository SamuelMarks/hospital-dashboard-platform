import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.deps import get_current_user
from app.models.user import User

BASE_URL = "http://testserver/api/v1/mpax_arena"


@pytest.fixture
def mock_user():
  user = MagicMock(spec=User)
  user.id = "user1"
  user.email = "test@example.com"
  return user


@pytest.fixture
def mock_mpax_service():
  with patch("app.api.routers.mpax_arena.mpax_arena_service.run_mpax_arena", new_callable=AsyncMock) as mock_run:
    mock_run.return_value = {"experiment_id": "test-exp", "mode": "judge", "candidates": []}
    yield mock_run


@pytest.mark.asyncio
async def test_run_mpax_arena_success(mock_user, mock_mpax_service):
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "Test prompt", "mode": "judge"})

  assert response.status_code == 200
  assert response.json()["experiment_id"] == "test-exp"
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_prompt(mock_user):
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "  ", "mode": "judge"})

  assert response.status_code == 400
  assert "Prompt cannot be empty" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_mode(mock_user):
  app.dependency_overrides[get_current_user] = lambda: mock_user

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": ""})

  assert response.status_code == 400
  assert "Mode must be specified" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_value_error(mock_user, mock_mpax_service):
  app.dependency_overrides[get_current_user] = lambda: mock_user
  mock_mpax_service.side_effect = ValueError("Invalid mode")

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": "invalid"})

  assert response.status_code == 400
  assert "Invalid mode" in response.json()["detail"]
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_run_mpax_arena_internal_error(mock_user, mock_mpax_service):
  app.dependency_overrides[get_current_user] = lambda: mock_user
  mock_mpax_service.side_effect = Exception("Boom")

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
    response = await client.post("/run", json={"prompt": "test", "mode": "judge"})

  assert response.status_code == 500
  assert "Boom" in response.json()["detail"]
  app.dependency_overrides = {}
