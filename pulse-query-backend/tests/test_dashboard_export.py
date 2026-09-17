"""
Tests for Analytical Data Export Engine in Dashboards Router.

Verifies JSON and CSV export formats, snapshot execution, and formula injection sanitization.
"""

import json
import uuid

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user, get_current_user_from_header_or_query
from app.models.dashboard import Dashboard, Widget
from app.models.user import User


@pytest.fixture
async def export_test_user(db_session):
  """
  Creates a persisted user and sets up authentication override.
  """
  user = User(
    id=uuid.uuid4(),
    email=f"export_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: user
  app.dependency_overrides[get_current_user_from_header_or_query] = lambda: user
  try:
    yield user
  finally:
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_from_header_or_query, None)


@pytest.mark.asyncio
async def test_export_dashboard_json_format(client: AsyncClient, export_test_user, db_session) -> None:
  """
  Verifies that JSON export returns the full layout, metadata, and widget snapshot data.
  """
  dash = Dashboard(
    id=uuid.uuid4(),
    name="Executive Clinical Overview",
    owner_id=export_test_user.id,
  )
  db_session.add(dash)
  await db_session.flush()

  sql_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Ward Census",
    type="SQL",
    visualization="bar_chart",
    config={"query": "SELECT 'ICU' as ward, 18 as count;"},
  )
  text_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Clinical Notes",
    type="TEXT",
    visualization="markdown",
    config={"content": "Notes for morning rounds"},
  )
  db_session.add(sql_widget)
  db_session.add(text_widget)
  await db_session.commit()

  response = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json")
  assert response.status_code == 200
  assert "application/json" in response.headers["content-type"]
  assert "Executive_Clinical_Overview_export.json" in response.headers["content-disposition"]

  payload = response.json()
  assert payload["dashboard_id"] == str(dash.id)
  assert payload["name"] == "Executive Clinical Overview"
  assert len(payload["widgets"]) == 2

  sql_entry = next(w for w in payload["widgets"] if w["type"] == "SQL")
  assert sql_entry["title"] == "Ward Census"
  assert len(sql_entry["data"]) == 1
  assert sql_entry["data"][0]["ward"] == "ICU"
  assert sql_entry["data"][0]["count"] == 18


@pytest.mark.asyncio
async def test_export_dashboard_csv_format_and_injection_sanitization(
  client: AsyncClient, export_test_user, db_session
) -> None:
  """
  Verifies CSV export and asserts leading formula injection characters are escaped.
  """
  # Create dashboard with potentially malicious formula triggers in name and data
  dash = Dashboard(
    id=uuid.uuid4(),
    name="=1+1 Safe Dashboard",
    owner_id=export_test_user.id,
  )
  db_session.add(dash)
  await db_session.flush()

  # Query returns values starting with =, @, +, -,
  sql_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Formula Injection Check",
    type="SQL",
    visualization="table",
    config={
      "query": """
        SELECT
          '=1+1' as formula_val,
          '@SUM(A1:A10)' as at_val,
          '+100' as plus_val,
          '-50' as minus_val,
          '	TAB' as tab_val,
          'Safe' as normal_val;
      """
    },
  )
  db_session.add(sql_widget)
  await db_session.commit()

  response = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=csv")
  assert response.status_code == 200
  assert "text/csv" in response.headers["content-type"]

  csv_text = response.text
  # Check header sanitization
  assert "'=1+1 Safe Dashboard" in csv_text

  # Check value sanitization
  assert "'=1+1" in csv_text
  assert "'@SUM(A1:A10)" in csv_text
  assert "'+100" in csv_text
  assert "'-50" in csv_text
  assert "'	TAB" in csv_text
  assert "Safe" in csv_text


@pytest.mark.asyncio
async def test_export_dashboard_sql_error_and_empty_data(client: AsyncClient, export_test_user, db_session) -> None:
  """
  Verifies CSV export handling when a query has an error or returns no rows.
  """
  dash = Dashboard(
    id=uuid.uuid4(),
    name="Error and Empty Dashboard",
    owner_id=export_test_user.id,
  )
  db_session.add(dash)
  await db_session.flush()

  # Widget with syntax error
  err_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Broken Query",
    type="SQL",
    visualization="table",
    config={"query": "SELECT * FROM non_existent_table_12345;"},
  )
  # Widget returning 0 rows
  empty_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Empty Query",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 1 as x WHERE 1 = 0;"},
  )
  # Text widget in CSV export
  txt_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Notes Widget",
    type="TEXT",
    visualization="markdown",
    config={"content": ""},
  )
  db_session.add(err_widget)
  db_session.add(empty_widget)
  db_session.add(txt_widget)
  await db_session.commit()

  response = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=csv")
  assert response.status_code == 200
  csv_text = response.text
  assert "Error:" in csv_text
  assert "No data" in csv_text


@pytest.mark.asyncio
async def test_export_dashboard_not_found(client: AsyncClient, export_test_user) -> None:
  """
  Verifies 404 response when exporting a non-existent dashboard.
  """
  random_id = uuid.uuid4()
  response = await client.get(f"/api/v1/dashboards/{random_id}/export")
  assert response.status_code == 404
  assert response.json()["detail"] == "Dashboard not found"


@pytest.mark.asyncio
async def test_export_dashboard_pdf_format(client: AsyncClient, export_test_user, db_session) -> None:
  """
  Verifies clinical PDF report export returns valid PDF binary stream and headers.
  """
  dash = Dashboard(
    id=uuid.uuid4(),
    name="Clinical Shift Handover",
    owner_id=export_test_user.id,
  )
  db_session.add(dash)
  await db_session.flush()

  sql_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Census Summary",
    type="SQL",
    visualization="table",
    config={"query": "SELECT 'ICU' AS ward, 24 AS census UNION ALL SELECT 'NICU', 12"},
  )
  err_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Error Widget",
    type="SQL",
    visualization="table",
    config={"query": "SELECT syntax error"},
  )
  empty_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Empty Widget",
    type="SQL",
    visualization="table",
    config={"query": "SELECT * FROM (SELECT 1 AS x) WHERE x = 2"},
  )
  text_widget = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="Handover Note",
    type="TEXT",
    visualization="markdown",
    config={"content": "No critical alerts"},
  )
  db_session.add(sql_widget)
  db_session.add(err_widget)
  db_session.add(empty_widget)
  db_session.add(text_widget)
  await db_session.commit()

  response = await client.get(f"/api/v1/dashboards/{dash.id}/export/pdf")
  assert response.status_code == 200
  assert response.headers["content-type"] == "application/pdf"
  assert "Clinical_Shift_Handover_clinical_report.pdf" in response.headers["content-disposition"]
  content = response.content
  assert content.startswith(b"%PDF-1.4")
  assert b"%%EOF" in content
  assert b"Pulse Query Clinical Report" in content
  assert b"Stanford Health Care" in content


@pytest.mark.asyncio
async def test_export_dashboard_pdf_not_found(client: AsyncClient, export_test_user) -> None:
  """
  Verifies 404 response when exporting PDF for a non-existent dashboard.
  """
  random_id = uuid.uuid4()
  response = await client.get(f"/api/v1/dashboards/{random_id}/export/pdf")
  assert response.status_code == 404
  assert response.json()["detail"] == "Dashboard not found"


def test_generate_clinical_pdf_report_branches() -> None:
  """
  Unit tests for generate_clinical_pdf_report covering all edge branches.
  """
  from datetime import UTC, datetime

  from app.services.pdf_export import generate_clinical_pdf_report

  custom_time = datetime(2026, 9, 15, 8, 30, 0, tzinfo=UTC)

  # 1. Non-dict row in rows
  non_dict_widgets = [
    {"title": "Non Dict", "type": "SQL", "data": ["just a string"]},
    {"title": "Special Chars (\\()", "type": "SQL", "data": []},
  ]
  pdf_bytes = generate_clinical_pdf_report(
    dashboard_name="Branch Test",
    author_email="test@hospital.org",
    widgets_data=non_dict_widgets,
    census_timestamp=custom_time,
  )
  assert pdf_bytes.startswith(b"%PDF-1.4")

  # 2. Page overflow (multi-page document pagination)
  many_widgets = [{"title": f"Widget {i}", "type": "SQL", "data": [{"k": v} for v in range(1)]} for i in range(50)]
  pdf_overflow = generate_clinical_pdf_report(
    dashboard_name="Overflow Test",
    author_email="test@hospital.org",
    widgets_data=many_widgets,
  )
  assert pdf_overflow.startswith(b"%PDF-1.4")
  assert pdf_overflow.endswith(b"%%EOF\n")
  assert b"/Count " in pdf_overflow
  # 3. Empty widgets list
  pdf_empty = generate_clinical_pdf_report(
    dashboard_name="Empty Test",
    author_email="test@hospital.org",
    widgets_data=[],
  )
  assert pdf_empty.startswith(b"%PDF-1.4")


@pytest.mark.asyncio
async def test_export_endpoints_query_token_authentication(client: AsyncClient, db_session) -> None:
  """
  Verifies that JSON, CSV, and PDF export endpoints accept JWT query tokens.

  Tests the browser download workflow where Authorization headers cannot be supplied.
  """
  from app.core import security
  from app.main import app

  owner = User(
    id=uuid.uuid4(),
    email=f"owner_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(owner)
  dash = Dashboard(
    id=uuid.uuid4(),
    name="Token Test Dashboard",
    owner_id=owner.id,
  )
  db_session.add(dash)
  await db_session.commit()

  token = security.create_access_token(subject=owner.id)

  # Temporarily remove dependency overrides to exercise real token validation
  saved_overrides = dict(app.dependency_overrides)
  app.dependency_overrides.pop(get_current_user, None)
  app.dependency_overrides.pop(get_current_user_from_header_or_query, None)

  try:
    # 1. Valid Query Token - JSON
    res_json = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json&token={token}")
    assert res_json.status_code == 200
    assert res_json.json()["name"] == "Token Test Dashboard"

    # 2. Valid Query Token - CSV
    res_csv = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=csv&token={token}")
    assert res_csv.status_code == 200
    assert "Token Test Dashboard" in res_csv.text

    # 3. Valid Query Token - PDF
    res_pdf = await client.get(f"/api/v1/dashboards/{dash.id}/export/pdf?token={token}")
    assert res_pdf.status_code == 200
    assert res_pdf.content.startswith(b"%PDF-1.4")

    # 4. Missing Token -> 401
    res_no_tok = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json")
    assert res_no_tok.status_code == 401

    # 5. Invalid Token -> 401
    res_bad_tok = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json&token=invalid-jwt")
    assert res_bad_tok.status_code == 401

    # 6. User without access -> 403
    other_user = User(
      id=uuid.uuid4(),
      email=f"other_{uuid.uuid4()}@hospital.org",
      hashed_password="pw",
      is_active=True,
    )
    db_session.add(other_user)
    await db_session.commit()
    other_token = security.create_access_token(subject=other_user.id)

    res_forbidden = await client.get(f"/api/v1/dashboards/{dash.id}/export?format=json&token={other_token}")
    assert res_forbidden.status_code in (403, 404)

  finally:
    app.dependency_overrides.update(saved_overrides)
