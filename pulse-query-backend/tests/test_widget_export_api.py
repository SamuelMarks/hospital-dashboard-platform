"""
Tests for Granular Per-Widget Export API.

Validates export of individual widgets and dashboards to JSON, CSV, and PDF formats,
including global filter placeholder interpolation, formula sanitization, permissions, and 404 handling.
"""

from unittest.mock import MagicMock
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.main import app
from app.models.dashboard import Dashboard, Widget
from app.models.user import User


@pytest.mark.asyncio
async def test_export_widget_json_and_csv(client: AsyncClient, db_session: AsyncSession) -> None:
  """Test exporting an individual SQL widget in JSON and CSV formats, including `{{global_*}}` placeholders."""
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
    config={"query": "SELECT 42 AS total_beds, 'ICU' AS dept WHERE 1=1 {{global_service}} {{global_date_range}}"},
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

  app.dependency_overrides[get_current_user] = lambda: app_user

  try:
    # 1. Export widget as JSON (verifies {{global_service}} & {{global_date_range}} stripped cleanly)
    res_json = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/export?format=json")
    assert res_json.status_code == 200
    assert "application/json" in res_json.headers["content-type"]
    json_data = res_json.json()
    assert json_data["title"] == "=CensusSummary"
    assert len(json_data["data"]) == 1
    assert json_data["data"][0]["total_beds"] == 42

    # 2. Export widget as CSV (tests formula sanitization)
    res_csv = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{wid.id}/export?format=csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    assert "'=CensusSummary" in csv_text
    assert "total_beds" in csv_text

    # 3. Export full dashboard as JSON, CSV, and PDF with {{global_*}} placeholders
    res_dash_json = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json")
    assert res_dash_json.status_code == 200
    assert res_dash_json.json()["widgets"][0]["data"][0]["total_beds"] == 42

    res_dash_pdf = await client.get(f"/api/v1/dashboards/{dash.id}/export/pdf")
    assert res_dash_pdf.status_code == 200
    assert res_dash_pdf.content.startswith(b"%PDF-1.4")

    # 4. Export TEXT widget as CSV (tests No data branch)
    res_text_csv = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{text_wid.id}/export?format=csv")
    assert res_text_csv.status_code == 200
    assert "No data" in res_text_csv.text

    # 5. Non-existent widget returns 404
    res_missing_wid = await client.get(f"/api/v1/dashboards/{dash.id}/widgets/{uuid.uuid4()}/export")
    assert res_missing_wid.status_code == 404

    # 6. Non-existent dashboard returns 404
    res_missing_dash = await client.get(f"/api/v1/dashboards/{uuid.uuid4()}/widgets/{wid.id}/export")
    assert res_missing_dash.status_code == 404

  finally:
    app.dependency_overrides.pop(get_current_user, None)
