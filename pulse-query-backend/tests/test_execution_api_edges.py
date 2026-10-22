"""
Edge-path tests for execution router.
"""

from typing import Any

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.database.postgres import get_db
from app.main import app
from app.services.cache_service import cache_service


@pytest.mark.asyncio
async def test_refresh_dashboard_text_widget_short_circuit() -> None:
  """TEXT widgets should return a success stub without execution."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  text_widget = MagicMock()
  text_widget.id = widget_id
  text_widget.type = "TEXT"
  text_widget.config = {}

  dashboard = MagicMock()
  dashboard.id = dashboard_id
  dashboard.owner_id = uuid.uuid4()
  dashboard.widgets = [text_widget]

  mock_user = MagicMock()
  mock_user.id = dashboard.owner_id
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = dashboard
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    response = await ac.post(f"/api/v1/dashboards/{dashboard_id}/refresh")

  assert response.status_code == 200
  data = response.json()
  assert data[str(widget_id)]["status"] == "success"
  assert data[str(widget_id)]["data"] is None

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_text_returns_stub() -> None:
  """Verifies single-widget refresh on a TEXT widget returns a `{status: 'success', data: None}` stub."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  widget = MagicMock()
  widget.id = widget_id
  widget.type = "TEXT"
  widget.config = {}

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = widget
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh")

  assert res.status_code == 200
  payload = res.json()[str(widget_id)]
  assert payload["status"] == "success"
  assert payload["data"] is None

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_not_found_returns_404() -> None:
  """Verifies single-widget refresh returns 404 when the widget does not exist on the dashboard."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = None
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh")

  assert res.status_code == 404

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_cache_hit_short_circuit() -> None:
  """Cached results should return without runner execution."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  widget = MagicMock()
  widget.id = widget_id
  widget.type = "SQL"
  widget.config = {"query": "SELECT 1"}

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = widget
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  cache_key = cache_service.generate_key("SQL", widget.config)
  cache_service.set(cache_key, {"data": ["cached"]})

  with patch("app.api.routers.execution.run_sql_widget") as mock_runner:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh")

    assert res.status_code == 200
    assert res.json()[str(widget_id)]["data"] == ["cached"]
    mock_runner.assert_not_called()

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_http_runs_request() -> None:
  """Verifies single-widget refresh dispatches `run_http_widget` for HTTP widgets."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  widget = MagicMock()
  widget.id = widget_id
  widget.type = "HTTP"
  widget.config = {"url": "http://example.com"}

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = widget
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  with patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as mock_http:
    mock_http.return_value = {"data": ["ok"]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh")

  assert res.status_code == 200
  assert res.json()[str(widget_id)]["data"] == ["ok"]
  mock_http.assert_awaited_once()

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_sql_exception_returns_error() -> None:
  """Verifies single-widget refresh catches DuckDB connection exceptions and returns an error dict."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  cache_service.clear()

  widget = MagicMock()
  widget.id = widget_id
  widget.type = "SQL"
  widget.config = {"query": f"SELECT {uuid.uuid4().int % 1000}"}

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = widget
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  with patch("app.api.routers.execution.duckdb_manager.get_readonly_connection", side_effect=RuntimeError("boom")):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh?force_refresh=true")

  assert res.status_code == 200
  assert "boom" in res.json()[str(widget_id)]["error"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_widget_unknown_type_returns_error() -> None:
  """Verifies single-widget refresh returns an `'Unknown widget type'` error for unrecognized widget types."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  widget = MagicMock()
  widget.id = widget_id
  widget.type = "ALIEN"
  widget.config = {}

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = widget
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh")

  assert res.status_code == 200
  assert "Unknown widget type" in res.json()[str(widget_id)]["error"]

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_refresh_dashboard_sql_batch_error_sets_internal_error() -> None:
  """SQL batch errors should populate error map."""
  widget_id = uuid.uuid4()
  dashboard_id = uuid.uuid4()

  cache_service.clear()

  sql_widget = MagicMock()
  sql_widget.id = widget_id
  sql_widget.type = "SQL"
  sql_widget.config = {"query": f"SELECT {uuid.uuid4().int % 1000}"}

  dashboard = MagicMock()
  dashboard.id = dashboard_id
  dashboard.owner_id = uuid.uuid4()
  dashboard.widgets = [sql_widget]

  mock_user = MagicMock()
  mock_user.id = dashboard.owner_id
  app.dependency_overrides[get_current_user] = lambda: mock_user

  mock_session = AsyncMock()
  mock_result = MagicMock()
  mock_result.scalars.return_value.first.return_value = dashboard
  mock_session.execute.return_value = mock_result
  app.dependency_overrides[get_db] = lambda: mock_session

  with patch("app.api.routers.execution.duckdb_manager.get_readonly_connection", side_effect=RuntimeError("db down")):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      res = await ac.post(f"/api/v1/dashboards/{dashboard_id}/refresh")

  assert res.status_code == 200
  assert res.json()[str(widget_id)]["error"] == "Internal Database Error"

  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_execution_multi_widget_branches(client: AsyncClient, db_session: object) -> None:
  """Verifies batch refresh across multiple HTTP and SQL widgets with mixed success, error, and exceptions."""
  from tests.conftest import AsyncSessionShim

  from app.core.security import create_access_token
  from app.models.dashboard import Dashboard, Widget
  from app.models.user import User

  assert isinstance(db_session, AsyncSessionShim)
  session = db_session
  user = User(id=uuid.uuid4(), email=f"exec_m_{uuid.uuid4()}@test.com", hashed_password="x", is_active=True)
  session.add(user)
  await session.commit()
  headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}

  dash = Dashboard(id=uuid.uuid4(), name="multi_exec_d", owner_id=user.id)
  session.add(dash)
  await session.flush()

  w_http_1 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="h1", type="HTTP", visualization="table", config={"url": "http1"}
  )
  w_http_2 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="h2", type="HTTP", visualization="table", config={"url": "http2"}
  )
  w_sql_1 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s1", type="SQL", visualization="table", config={"query": "q1"}
  )
  w_sql_2 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s2", type="SQL", visualization="table", config={"query": "q2"}
  )
  w_sql_3 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s3", type="SQL", visualization="table", config={"query": "q3"}
  )
  session.add_all([w_http_1, w_http_2, w_sql_1, w_sql_2, w_sql_3])
  await session.commit()

  async def mock_http_impl(cfg: dict[str, Any], **_kwargs: object) -> dict[str, Any]:
    """
    Simulates HTTP widget execution returning an error for `http1` and success for `http2`.

    Args:
        cfg (dict[str, Any]): Widget config dictionary.
        **_kwargs (object): Additional keyword arguments.

    Returns:
        dict[str, Any]: Simulated HTTP widget response.
    """
    if cfg.get("url") == "http1":
      return {"error": "HTTP Error"}
    return {"status": "ok", "data": [1]}

  def mock_sql_impl(_cursor: object, cfg: dict[str, Any]) -> dict[str, Any]:
    """
    Simulates SQL widget execution returning an error for `q1`, data for `q2`, and raising on `q3`.

    Args:
        _cursor (object): DuckDB cursor.
        cfg (dict[str, Any]): Widget config dictionary.

    Returns:
        dict[str, Any]: Simulated SQL widget response.
    """
    q = cfg.get("query")
    if q == "q1":
      return {"error": "SQL Error"}
    if q == "q2":
      return {"data": [{"val": 1}]}
    raise RuntimeError("Crash on q3")

  cache_service.clear()
  with (
    patch("app.api.routers.execution.run_http_widget", side_effect=mock_http_impl),
    patch("app.api.routers.execution.run_sql_widget", side_effect=mock_sql_impl),
  ):
    res = await client.post(f"/api/v1/dashboards/{dash.id}/refresh", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body[str(w_http_1.id)]["error"] == "HTTP Error"
    assert body[str(w_http_2.id)]["data"] == [1]
    assert body[str(w_sql_1.id)]["error"] == "SQL Error"
    assert body[str(w_sql_2.id)]["data"] == [{"val": 1}]
    assert body[str(w_sql_3.id)]["error"] == "Internal Database Error"
