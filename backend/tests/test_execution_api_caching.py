"""
Tests for Execution API Caching Integration.

Verifies that:
1. First request triggers execution (Miss).
2. Second request returns cached result without execution (Hit).
3. Forced Refresh bypasses cache read.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.cache_service import cache_service
from app.api.deps import get_current_user
from app.database.postgres import get_db

MOCK_DASH_ID = uuid.uuid4()
MOCK_WIDGET_ID = uuid.uuid4()


@pytest.fixture
def mock_dashboard() -> MagicMock:
  """
  Create a dashboard mock with one SQL widget.

  Returns:
      MagicMock: A mocked dashboard object structure.
  """
  w = MagicMock()
  w.id = MOCK_WIDGET_ID
  w.type = "SQL"
  w.config = {"query": "SELECT 1"}

  d = MagicMock()
  d.id = MOCK_DASH_ID
  d.widgets = [w]
  return d


@pytest.mark.asyncio
async def test_refresh_dashboard_caching_flow(mock_dashboard: MagicMock) -> None:
  """
  Test the Hit/Miss lifecycle logic in the batch refresh endpoint.

  Verifies that the first call invokes the runner, while the second call
  retrieves data from the cache service.

  Args:
      mock_dashboard (MagicMock): The dashboard fixture.
  """
  # 1. Setup Auth & DB Mocks
  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  mock_dashboard.owner_id = mock_user.id

  # Use dependency_overrides with function keys
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # DB Setup
  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = mock_dashboard
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  # Mock DB
  with (
    patch("app.api.routers.execution.run_sql_widget") as mock_runner,
    patch("app.api.routers.execution.duckdb_manager") as mock_duck,
  ):
    # DuckDB Setup
    mock_conn = MagicMock()
    mock_duck.get_readonly_connection.return_value = mock_conn

    # Runner Setup
    mock_runner.return_value = {"data": ["fresh_data"]}

    # Clear Cache Service before test
    cache_service.clear()

    # --- Phase 1: Cache Miss ---
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res1 = await ac.post(f"/api/v1/dashboards/{MOCK_DASH_ID}/refresh")

    assert res1.status_code == 200
    assert mock_runner.call_count == 1
    assert res1.json()[str(MOCK_WIDGET_ID)]["data"] == ["fresh_data"]

    # --- Phase 2: Cache Hit ---
    # Call again. Runner should NOT be called incremented (count stays 1)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res2 = await ac.post(f"/api/v1/dashboards/{MOCK_DASH_ID}/refresh")

    assert res2.status_code == 200
    # The runner count should STILL be 1
    assert mock_runner.call_count == 1
    # Data should match
    assert res2.json()[str(MOCK_WIDGET_ID)]["data"] == ["fresh_data"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_single_widget_force_refresh(mock_dashboard: MagicMock) -> None:
  """
  Test that ?force_refresh=true bypasses the cache retrieval.

  Verifies that even if data exists in the cache, the runner is invoked
  again if the force flag is active.

  Args:
      mock_dashboard (MagicMock): The dashboard fixture.
  """
  mock_user = MagicMock()
  mock_dashboard.owner_id = mock_user.id
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # Pre-seed Cache
  key = cache_service.generate_key("SQL", {"query": "SELECT 1"})
  cache_service.set(key, {"data": ["stale_data"]})

  # Minimal DB Mock setup for single widget
  mock_session = AsyncMock()
  mock_result = MagicMock()
  # Single widget query returns scalar().first() directly
  mock_result.scalars.return_value.first.return_value = mock_dashboard.widgets[0]
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  with (
    patch("app.api.routers.execution.run_sql_widget") as mock_runner,
    patch("app.api.routers.execution.duckdb_manager") as mock_duck,
  ):
    mock_duck.get_readonly_connection.return_value = MagicMock()

    # Runner returns FRESH data
    mock_runner.return_value = {"data": ["fresh_data"]}

    # Action: Call with force_refresh=true
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"/api/v1/dashboards/{MOCK_DASH_ID}/widgets/{MOCK_WIDGET_ID}/refresh?force_refresh=true")

    assert res.status_code == 200
    # Should return FRESH data, ignoring the pre-seeded "stale_data"
    assert res.json()[str(MOCK_WIDGET_ID)]["data"] == ["fresh_data"]

    # Verify runner executed
    mock_runner.assert_called()

  app.dependency_overrides = {}
