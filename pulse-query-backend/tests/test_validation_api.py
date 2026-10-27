"""
Tests for SQL Validation in Dashboard Router.

Verifies that the API blocks invalid SQL syntax and multi-statement queries
during widget creation and updates against real PostgreSQL/SQLite persistence and DuckDB `PREPARE`.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core import security
from app.main import app
from app.models.dashboard import Dashboard, Widget
from app.models.user import User


async def _seed_user_and_widget(db_session: AsyncSession) -> tuple[User, Dashboard, Widget]:
  """
  Seeds an authenticated user, dashboard, and SQL widget in `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.

  Returns:
      tuple[User, Dashboard, Widget]: Tuple of `(user, dashboard, widget)`.
  """
  user = User(
    email=f"val_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  db_session.add(user)
  await db_session.flush()

  dash = Dashboard(name="Validation Board", owner_id=user.id)
  db_session.add(dash)
  await db_session.flush()

  widget = Widget(
    dashboard_id=dash.id,
    title="Test Widget",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 1"},
  )
  db_session.add(widget)
  await db_session.commit()
  return user, dash, widget


@pytest.mark.asyncio
async def test_update_widget_valid_sql_dry_run(client: AsyncClient, db_session: AsyncSession) -> None:
  """Test that a valid query passes real DuckDB `PREPARE` validation and persists in the database."""
  user, _, widget = await _seed_user_and_widget(db_session)
  app.dependency_overrides[get_current_user] = lambda: user
  try:
    res = await client.put(
      f"/api/v1/dashboards/widgets/{widget.id}",
      json={"visualization": "bar_chart", "config": {"query": "SELECT COUNT(*) AS cnt FROM hospital_data"}},
    )
    assert res.status_code == 200
    assert res.json()["visualization"] == "bar_chart"
    assert res.json()["config"]["query"] == "SELECT COUNT(*) AS cnt FROM hospital_data"
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_update_widget_invalid_sql_returns_400(client: AsyncClient, db_session: AsyncSession) -> None:
  """Test that an invalid SQL query or multi-statement query raises 400 Bad Request on create and update."""
  user, dash, widget = await _seed_user_and_widget(db_session)
  app.dependency_overrides[get_current_user] = lambda: user
  try:
    res_create_bad = await client.post(
      f"/api/v1/dashboards/{dash.id}/widgets",
      json={"title": "Bad", "type": "SQL", "visualization": "table", "config": {"query": "SELECT * FRO ("}},
    )
    assert res_create_bad.status_code == 400

    res_syntax = await client.put(
      f"/api/v1/dashboards/widgets/{widget.id}",
      json={"config": {"query": "SELECT * FRO ("}},
    )
    assert res_syntax.status_code == 400
    assert "Invalid SQL" in res_syntax.json()["detail"]

    res_multi = await client.put(
      f"/api/v1/dashboards/widgets/{widget.id}",
      json={"config": {"query": "SELECT 1; SELECT 2"}},
    )
    assert res_multi.status_code == 400
    assert "Multiple SQL statements are not permitted" in res_multi.json()["detail"]
  finally:
    app.dependency_overrides.pop(get_current_user, None)
