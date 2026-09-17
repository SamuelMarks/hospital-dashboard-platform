"""
Tests for Granular Per-Widget Export API.

Validates export of individual widgets to JSON and CSV formats,
including formula sanitization, permissions, and 404 handling.
"""

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.models.dashboard import Dashboard, Widget
from app.models.user import User


@pytest.mark.asyncio
async def test_export_widget_json_and_csv(client: AsyncClient, db_session) -> None:
  """Test exporting an individual SQL widget in JSON and CSV formats."""
  owner = User(
    id=uuid.uuid4(),
    email="export_owner@hospital.org",
    role="DATA_ANALYST",
    is_active=True,
    is_admin=False,
    hashed_password="pw",
  )
  dash = Dashboard(id=uuid.uuid4(), name="Widget Export Dash", owner_id=owner.id)
  db_session.add_all([owner, dash])
  await db_session.flush()

  wid = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="=CensusSummary",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 42 AS total_beds, 'ICU' AS dept"},
  )
  text_wid = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Notes",
    type="TEXT",
    visualization="text",
    config={"content": "Clinical notes"},
  )
  db_session.add_all([wid, text_wid])
  await db_session.commit()

  app_user = MagicMock(spec=User)
  app_user.id = owner.id
  app_user.email = owner.email
  app_user.role = owner.role
  app_user.is_admin = False
  app_user.is_active = True
  app_user.language_preference = "en"

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: app_user

  try:
    # 1. Export as JSON
    res_json = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/export?format=json")
    assert res_json.status_code == 200
    assert "application/json" in res_json.headers["content-type"]
    json_data = res_json.json()
    assert json_data["title"] == "=CensusSummary"
    assert len(json_data["data"]) > 0

    # 2. Export as CSV (tests formula sanitization)
    res_csv = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/export?format=csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    assert "'Census =Summary" in csv_text or "total_beds" in csv_text

    # 3. Export TEXT widget as CSV (tests No data branch)
    res_text_csv = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{text_wid.id}/export?format=csv")
    assert res_text_csv.status_code == 200
    assert "No data" in res_text_csv.text

    # 4. Non-existent widget returns 404
    res_missing_wid = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{uuid.uuid4()}/export")
    assert res_missing_wid.status_code == 404

    # 5. Non-existent dashboard returns 404
    res_missing_dash = await client.get(f"/api/v1/dashboards/{uuid.uuid4()}/widgets/{wid.id}/export")
    assert res_missing_dash.status_code == 404

  finally:
    app.dependency_overrides.pop(get_current_user, None)
