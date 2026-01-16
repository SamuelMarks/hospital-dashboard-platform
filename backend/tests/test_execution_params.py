"""
Tests for Execution Router + Parameter Injection.
"""

import uuid
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user
from app.database.postgres import get_db


@pytest.mark.asyncio
async def test_refresh_dashboard_injects_global_params() -> None:
  """
  Verify that {{global_service}} is replaced by the value in the request body.
  """
  # Setup Mocks
  mock_dash_id = uuid.uuid4()
  mock_widget_id = uuid.uuid4()

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  # Widget with placeholder SQL
  mock_widget = MagicMock()
  mock_widget.id = mock_widget_id
  mock_widget.type = "SQL"
  # Note valid syntax: WHERE 1=1 {{global_service}}
  mock_widget.config = {"query": "SELECT * FROM t WHERE 1=1 {{global_service}}"}

  mock_dash = MagicMock()
  mock_dash.id = mock_dash_id
  mock_dash.owner_id = mock_user.id
  mock_dash.widgets = [mock_widget]

  app.dependency_overrides[get_current_user] = lambda: mock_user

  # DB returns dashboard
  mock_sess = AsyncMock()

  mock_result = MagicMock()
  # Ensure scalars() calls return the mock object that has .first()
  mock_scalars_res = MagicMock()
  mock_scalars_res.first.return_value = mock_dash
  mock_result.scalars.return_value = mock_scalars_res

  mock_sess.execute.return_value = mock_result

  app.dependency_overrides[get_db] = lambda: mock_sess

  with (
    patch("app.api.routers.execution.duckdb_manager") as mock_duck,
    patch("app.api.routers.execution.run_sql_widget") as mock_runner,
    patch("app.api.routers.execution.cache_service") as mock_cache,
  ):
    # Runs SQL
    mock_duck.get_readonly_connection.return_value = MagicMock()
    # Cache Miss
    mock_cache.get.return_value = None
    mock_runner.return_value = {"data": []}

    # CALL API with Global Params
    # FIX: Send the params directly as the body, not wrapped in "global_params"
    params = {"dept": "Cardiology"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      await ac.post(f"/api/v1/dashboards/{mock_dash_id}/refresh", json=params)

    # ASSERTION:
    # Check that run_sql_widget was called with the REPLACED query
    args, _ = mock_runner.call_args
    config_passed = args[1]

    expected_fragment = "AND Clinical_Service = 'Cardiology'"
    assert expected_fragment in config_passed["query"]
    assert "{{global_service}}" not in config_passed["query"]

  app.dependency_overrides = {}
