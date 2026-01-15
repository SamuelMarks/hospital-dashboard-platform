"""
Tests for the Execution API Router.

Verifies the 'refresh_dashboard' endpoint logic:
- Ensures HTTP widgets are gathered.
- Ensures SQL widgets utilize a shared DuckDB connection.
- Verifies result merging.
- Verifies ownership security.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user
from app.database.postgres import get_db

# Constants for Mocking
MOCK_DASHBOARD_ID = uuid.uuid4()
MOCK_USER_ID = uuid.uuid4()
MOCK_SQL_WIDGET_ID = uuid.uuid4()
MOCK_HTTP_WIDGET_ID = uuid.uuid4()


@pytest.fixture
def mock_dashboard_data():
  """
  Creates a mock Dashboard object with one SQL widget and one HTTP widget.
  """
  # Mock Widget Objects
  sql_widget = MagicMock()
  sql_widget.id = MOCK_SQL_WIDGET_ID
  sql_widget.type = "SQL"
  sql_widget.config = {"query": "SELECT 1"}

  http_widget = MagicMock()
  http_widget.id = MOCK_HTTP_WIDGET_ID
  http_widget.type = "HTTP"
  http_widget.config = {"url": "http://api.com"}

  # Mock Dashboard
  dashboard = MagicMock()
  dashboard.id = MOCK_DASHBOARD_ID
  dashboard.owner_id = MOCK_USER_ID
  dashboard.widgets = [sql_widget, http_widget]

  return dashboard


@pytest.mark.anyio
async def test_refresh_dashboard_success(mock_dashboard_data) -> None:
  """
  Test the happy path execution of a dashboard with mixed widgets.
  """
  # 1. Mock Authentication
  # We patch `get_current_user` to return a user that owns the dashboard
  mock_user = MagicMock()
  mock_user.id = MOCK_USER_ID
  app.dependency_overrides[get_current_user] = lambda: mock_user

  # 2. Mock Database Session to return our dashboard
  # We mock the async session result.scalars().first() chain
  with patch("app.api.routers.execution.get_db") as mock_get_db:
    mock_db_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_dashboard_data
    mock_db_session.execute.return_value = mock_result

    # Override the get_db dependency using the function reference from app.database.postgres
    app.dependency_overrides[get_db] = lambda: mock_db_session

    # 3. Mock Runners and DuckDB
    # We want to verify these are called correctly
    with (
      patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as mock_run_http,
      patch("app.api.routers.execution.run_sql_widget") as mock_run_sql,
      patch("app.api.routers.execution.duckdb_manager") as mock_duck_mgr,
    ):
      # Setup Runner Returns
      mock_run_http.return_value = {"status": 200, "data": "http_data"}
      mock_run_sql.return_value = {"error": None, "data": ["sql_row"]}

      # Setup DuckDB Mock (Manager returns connection, connection returns cursor)
      mock_conn = MagicMock()
      mock_cursor = MagicMock()
      mock_conn.cursor.return_value = mock_cursor
      mock_duck_mgr.get_readonly_connection.return_value = mock_conn

      # 4. Execute Request
      async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
          f"/api/v1/dashboards/{MOCK_DASHBOARD_ID}/refresh", headers={"Authorization": "Bearer sample_token"}
        )

      # 5. Assertions
      assert response.status_code == 200
      data = response.json()

      # Verify Results Merged Correctly
      # Keys in JSON are strings (UUIDs converted)
      assert str(MOCK_HTTP_WIDGET_ID) in data
      assert data[str(MOCK_HTTP_WIDGET_ID)]["data"] == "http_data"

      assert str(MOCK_SQL_WIDGET_ID) in data
      assert data[str(MOCK_SQL_WIDGET_ID)]["data"] == ["sql_row"]

      # Verify Logic
      # HTTP runner called with token (stripped of 'Bearer ')
      mock_run_http.assert_called_once()
      call_kwargs = mock_run_http.call_args[1]
      assert call_kwargs["forward_auth_token"] == "sample_token"

      # SQL runner called with cursor
      mock_run_sql.assert_called_once_with(mock_cursor, mock_dashboard_data.widgets[0].config)

      # Connection closed
      mock_conn.close.assert_called_once()

  # Cleanup overrides
  app.dependency_overrides = {}


@pytest.mark.anyio
async def test_refresh_dashboard_not_found() -> None:
  """
  Test 404 behavior when dashboard does not exist or user is not owner.
  """
  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with patch("app.api.routers.execution.get_db") as mock_get_db:
    mock_db_session = AsyncMock()
    # Simulate None return from DB
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_db_session.execute.return_value = mock_result

    app.dependency_overrides[get_db] = lambda: mock_db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      response = await ac.post(f"/api/v1/dashboards/{uuid.uuid4()}/refresh")

    assert response.status_code == 404
    assert response.json()["detail"] == "Dashboard not found"

  app.dependency_overrides = {}


@pytest.mark.anyio
async def test_refresh_dashboard_unknown_widget_type(mock_dashboard_data) -> None:
  """
  Test that unknown widget types are handled gracefully without crashing.
  """
  # Add a weird widget
  weird_widget = MagicMock()
  weird_widget.id = uuid.uuid4()
  weird_widget.type = "ALIEN_TECH"
  mock_dashboard_data.widgets.append(weird_widget)

  mock_user = MagicMock()
  mock_user.id = MOCK_USER_ID
  app.dependency_overrides[get_current_user] = lambda: mock_user

  with (
    patch("app.api.routers.execution.get_db") as mock_db_patch,
    patch("app.api.routers.execution.duckdb_manager"),
    patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock),
    patch("app.api.routers.execution.run_sql_widget"),
  ):
    # Setup DB return
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_dashboard_data
    mock_session.execute.return_value = mock_result
    app.dependency_overrides[get_db] = lambda: mock_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
      response = await ac.post(f"/api/v1/dashboards/{MOCK_DASHBOARD_ID}/refresh")

    assert response.status_code == 200
    data = response.json()

    # Check weird widget result
    weird_res = data[str(weird_widget.id)]
    assert "error" in weird_res
    assert "Unknown widget type" in weird_res["error"]

  app.dependency_overrides = {}
