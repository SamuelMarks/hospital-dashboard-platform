"""
Tests for SQL Validation in Dashboard Router.

Verifies that the API blocks invalid SQL syntax during widget creation/updates
by running a 'Dry-Run'.
"""

import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user
from app.database.postgres import get_db
from unittest.mock import patch, MagicMock, AsyncMock

# --- Success Case ---


@pytest.mark.asyncio
async def test_update_widget_valid_sql_dry_run() -> None:
  """Test that a valid query passes validation and saves."""
  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_existing = MagicMock()

  # Populate required fields to pass Response Model validation
  mock_existing.type = "SQL"
  mock_existing.id = uuid.uuid4()
  mock_existing.dashboard_id = uuid.uuid4()
  mock_existing.title = "Test Widget"
  mock_existing.visualization = "table"
  mock_existing.config = {"query": "SELECT 1"}

  mock_result.scalars.return_value.first.return_value = mock_existing
  mock_session.execute.return_value = mock_result

  app.dependency_overrides[get_db] = lambda: mock_session

  with patch("app.api.routers.dashboards.duckdb_manager") as mock_duck:
    mock_conn = MagicMock()
    mock_duck.get_readonly_connection.return_value = mock_conn

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.put(
        f"/api/v1/dashboards/widgets/{uuid.uuid4()}",
        json={"config": {"query": "SELECT 1"}},
      )

    assert res.status_code == 200
    mock_conn.execute.assert_any_call("PREPARE v AS SELECT 1")

  app.dependency_overrides = {}


# --- Failure Case ---


@pytest.mark.asyncio
async def test_update_widget_invalid_sql_returns_400() -> None:
  """Test that an invalid query raises 400 Bad Request."""
  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_existing = MagicMock()
  mock_existing.type = "SQL"
  # Basic fields not needed here as we crash before return,
  # but good practice to keep them for robustness
  mock_existing.id = uuid.uuid4()
  mock_existing.dashboard_id = uuid.uuid4()
  mock_existing.title = "Test Widget"

  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = mock_existing
  mock_session.execute.return_value = mock_result

  app.dependency_overrides[get_db] = lambda: mock_session

  with patch("app.api.routers.dashboards.duckdb_manager") as mock_duck:
    mock_conn = MagicMock()
    mock_conn.execute.side_effect = Exception("Parser Error: syntax error at or near 'FRO'")
    mock_duck.get_readonly_connection.return_value = mock_conn

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.put(
        f"/api/v1/dashboards/widgets/{uuid.uuid4()}",
        json={"config": {"query": "SELECT * FRO"}},
      )

    assert res.status_code == 400
    data = res.json()
    assert "Invalid SQL Query" in data["detail"]
    assert "Parser Error" in data["detail"]

  app.dependency_overrides = {}
