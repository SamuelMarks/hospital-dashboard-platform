"""
Tests for Schema API Router.

Verifies that the endpoint correctly returns the database structure
and enforces authentication.
"""

import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user

BASE_URL = "http://test"
SCHEMA_ENDPOINT = "/api/v1/schema/"


@pytest.mark.asyncio
async def test_get_schema_success() -> None:
  """
  Test happy path for fetching database schema.
  """
  # 1. Mock Authentication
  mock_user = MagicMock()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # 2. Mock Schema Service
  mock_schema_data = [
    {"table_name": "hospital_data", "columns": [{"name": "id", "type": "INTEGER"}, {"name": "dept", "type": "VARCHAR"}]},
    {"table_name": "users", "columns": [{"name": "email", "type": "VARCHAR"}]},
  ]

  with patch("app.api.routers.schema.schema_service.get_schema_json") as mock_get:
    mock_get.return_value = mock_schema_data

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
      response = await ac.get(SCHEMA_ENDPOINT)

    assert response.status_code == 200
    data = response.json()

    assert len(data) == 2
    assert data[0]["table_name"] == "hospital_data"
    assert data[0]["columns"][0]["name"] == "id"

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_get_schema_unauthorized() -> None:
  """
  Test that the schema endpoint requires a valid session.
  """
  app.dependency_overrides = {}

  async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
    response = await ac.get(SCHEMA_ENDPOINT)

  assert response.status_code == 401
