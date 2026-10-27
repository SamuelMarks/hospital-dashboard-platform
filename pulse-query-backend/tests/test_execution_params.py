"""
Tests for Execution Router + Parameter Injection across dashboard and single-widget refresh.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.database.postgres import get_db
from app.main import app


@pytest.mark.asyncio
async def test_refresh_dashboard_injects_global_params() -> None:
  """Verify that `{{global_service}}` is replaced by the value in the request body during full dashboard refresh."""
  mock_dash_id = uuid.uuid4()
  mock_widget_id = uuid.uuid4()

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  mock_widget = MagicMock()
  mock_widget.id = mock_widget_id
  mock_widget.type = "SQL"
  mock_widget.config = {"query": "SELECT * FROM t WHERE 1=1 {{global_service}}"}

  mock_dash = MagicMock()
  mock_dash.id = mock_dash_id
  mock_dash.owner_id = mock_user.id
  mock_dash.widgets = [mock_widget]

  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_sess = AsyncMock()
  mock_result = MagicMock()
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
    mock_duck.get_readonly_connection.return_value = MagicMock()
    mock_cache.get.return_value = None
    mock_runner.return_value = {"data": []}

    params = {"dept": "Cardiology"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      await ac.post(f"/api/v1/dashboards/{mock_dash_id}/refresh", json=params)

    args, _ = mock_runner.call_args
    config_passed = args[1]

    expected_fragment = "AND Clinical_Service = 'Cardiology'"
    assert expected_fragment in config_passed["query"]
    assert "{{global_service}}" not in config_passed["query"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_single_widget_injects_global_params() -> None:
  """Verify `POST /dashboards/{id}/widgets/{wid}/refresh` interpolates `{{global_service}}` and `{{global_date_range}}`."""
  mock_dash_id = uuid.uuid4()
  mock_widget_id = uuid.uuid4()

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  mock_widget = MagicMock()
  mock_widget.id = mock_widget_id
  mock_widget.dashboard_id = mock_dash_id
  mock_widget.type = "SQL"
  mock_widget.config = {
    "query": "SELECT * FROM synthetic_hospital_data WHERE 1=1 {{global_service}} {{global_date_range}}"
  }

  mock_dash = MagicMock()
  mock_dash.id = mock_dash_id
  mock_dash.owner_id = mock_user.id
  mock_dash.widgets = [mock_widget]

  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_sess = AsyncMock()
  res_dash = MagicMock()
  res_dash.scalars.return_value.first.return_value = mock_dash
  res_widget = MagicMock()
  res_widget.scalars.return_value.first.return_value = mock_widget
  mock_sess.execute.side_effect = [res_dash, res_widget]

  app.dependency_overrides[get_db] = lambda: mock_sess

  with (
    patch("app.api.routers.execution.duckdb_manager") as mock_duck,
    patch("app.api.routers.execution.run_sql_widget") as mock_runner,
    patch("app.api.routers.execution.cache_service") as mock_cache,
  ):
    mock_duck.get_readonly_connection.return_value = MagicMock()
    mock_cache.get.return_value = None
    mock_runner.return_value = {"data": [{"cnt": 5}], "columns": ["cnt"], "error": None}

    params = {"dept": "Cardiology", "start_date": "2023-01-01", "end_date": "2023-01-31", "shift": "Day"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(
        f"/api/v1/dashboards/{mock_dash_id}/widgets/{mock_widget_id}/refresh?force_refresh=true",
        json=params,
      )

    assert res.status_code == 200
    args, _ = mock_runner.call_args
    config_passed = args[1]
    assert "AND Clinical_Service = 'Cardiology'" in config_passed["query"]
    assert "AND Midnight_Census_DateTime BETWEEN '2023-01-01' AND '2023-01-31'" in config_passed["query"]
    assert "{{global_service}}" not in config_passed["query"]
    assert "{{global_date_range}}" not in config_passed["query"]

  app.dependency_overrides = {}
