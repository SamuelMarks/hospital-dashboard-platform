import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select, func
from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate

# Note: The 'client' and 'db_session' fixtures are provided by conftest.py


@pytest.mark.asyncio
async def test_dashboard_crud_flow(client: AsyncClient) -> None:
  """
  Test the Dashboard Creation, Widget Addition, and Listing flow.
  Verifies that a user can register, create a custom dashboard, add a widget to it,
  and retrieve it via the list endpoint.
  """
  # 1. Login (Create user on fly for test isolation)
  email = f"dash_user_{uuid.uuid4()}@example.com"
  pwd = "password123"

  # Register
  register_res = await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  assert register_res.status_code == 200

  # Login
  login_res = await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
  assert login_res.status_code == 200
  token = login_res.json()["access_token"]
  headers = {"Authorization": f"Bearer {token}"}

  # 2. Create Dashboard
  dash_payload = {"name": "My Analytics"}
  dash_res = await client.post("/api/v1/dashboards/", json=dash_payload, headers=headers)
  assert dash_res.status_code == 200
  dash_id = dash_res.json()["id"]

  # 3. Add Widget
  # NOTE: We use 'hospital_data' table which corresponds to the default CSV ingest
  widget_payload = {
    "title": "Visits Count",
    "type": "SQL",
    "visualization": "metric",
    "config": {
      "query": "SELECT count(*) FROM hospital_data",
      "x": 0,
      "y": 0,
      "w": 4,
      "h": 2,
    },
  }
  widget_res = await client.post(
    f"/api/v1/dashboards/{dash_id}/widgets",
    json=widget_payload,
    headers=headers,
  )
  assert widget_res.status_code == 200
  assert widget_res.json()["title"] == "Visits Count"

  # 4. List Dashboards (Verify widget presence)
  list_res = await client.get("/api/v1/dashboards/", headers=headers)
  assert list_res.status_code == 200
  data = list_res.json()

  # Isolation verification: Expect default + custom
  assert len(data) >= 2

  my_dash = next((d for d in data if d["id"] == dash_id), None)
  assert my_dash is not None
  assert my_dash["widgets"][0]["visualization"] == "metric"


@pytest.mark.asyncio
async def test_restore_defaults_endpoint(client: AsyncClient, db_session) -> None:
  """
  Tests the 'Restore Defaults' functionality.
  Included Scenarios:
  1. Restore on top of existing default (Should Clone).
  2. Restore again (Should Increment Suffix).
  """
  # 1. Setup: Register User (Auto-provisions "Hospital Command Center")
  email = f"restore_{uuid.uuid4()}@example.com"
  pwd = "pw"

  # Inject a dummy template to ensure widgets are created
  t = WidgetTemplate(title="Template A", sql_template="SELECT 1", category="Test")
  db_session.add(t)
  await db_session.commit()

  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  login = await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
  headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

  # 2. First Restore (Collision with initial registration)
  # Should create "Hospital Command Center (Restored)"
  res1 = await client.post("/api/v1/dashboards/restore-defaults", headers=headers)
  assert res1.status_code == 200
  dash1 = res1.json()
  assert dash1["name"] == "Hospital Command Center (Restored)"
  assert len(dash1["widgets"]) == 1  # 1 template injected

  # 3. Second Restore (Collision with first restore)
  # Should create "Hospital Command Center (Restored 1)"
  res2 = await client.post("/api/v1/dashboards/restore-defaults", headers=headers)
  assert res2.status_code == 200
  dash2 = res2.json()
  assert dash2["name"] == "Hospital Command Center (Restored 1)"

  # 4. Third Restore
  # Should create "Hospital Command Center (Restored 2)"
  res3 = await client.post("/api/v1/dashboards/restore-defaults", headers=headers)
  assert res3.status_code == 200
  dash3 = res3.json()
  assert dash3["name"] == "Hospital Command Center (Restored 2)"

  # 5. List Verification
  # User should have: Original, Restored, Restored 1, Restored 2 (4 total)
  list_res = await client.get("/api/v1/dashboards/", headers=headers)
  assert len(list_res.json()) == 4
