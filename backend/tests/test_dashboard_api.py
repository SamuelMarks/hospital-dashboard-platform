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


@pytest.mark.asyncio
async def test_reorder_endpoint(client: AsyncClient) -> None:
  """
  Test the bulk reordering endpoint.
  Verifies that drag-and-drop actions persist the new 'order' and 'group' values.
  """
  email = f"reorder_{uuid.uuid4()}@example.com"
  pwd = "pw"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})).json()["access_token"]
  headers = {"Authorization": f"Bearer {token}"}

  # Create Dash
  dash = (await client.post("/api/v1/dashboards/", json={"name": "Sort"}, headers=headers)).json()
  did = dash["id"]

  # Create 2 Widgets with VALID SQL (Validation middleware is active)
  # Using "SELECT 1" ensures validation passes.
  w1_res = await client.post(
    f"/api/v1/dashboards/{did}/widgets",
    json={"title": "W1", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 1"}},
    headers=headers,
  )
  assert w1_res.status_code == 200
  w1 = w1_res.json()

  w2_res = await client.post(
    f"/api/v1/dashboards/{did}/widgets",
    json={"title": "W2", "type": "SQL", "visualization": "t", "config": {"query": "SELECT 2"}},
    headers=headers,
  )
  assert w2_res.status_code == 200
  w2 = w2_res.json()

  # Reorder Logic: Swap index 0 and 1
  # Assign them explicit groups
  payload = {"items": [{"id": w1["id"], "order": 1, "group": "B"}, {"id": w2["id"], "order": 0, "group": "A"}]}

  res = await client.post(f"/api/v1/dashboards/{did}/reorder", json=payload, headers=headers)
  assert res.status_code == 200
  assert res.json()["updated"] == 2

  # Verify persistence via GET
  dash_updated = (await client.get(f"/api/v1/dashboards/{did}", headers=headers)).json()
  widgets = {w["id"]: w for w in dash_updated["widgets"]}

  assert widgets[w1["id"]]["config"]["order"] == 1
  assert widgets[w1["id"]]["config"]["group"] == "B"
  assert widgets[w2["id"]]["config"]["order"] == 0
  assert widgets[w2["id"]]["config"]["group"] == "A"


@pytest.mark.asyncio
async def test_clone_dashboard_endpoint(client: AsyncClient, db_session) -> None:
  """
  Test the 'Clone Dashboard' functionality.
  Verifies that a deep copy of the dashboard and its widgets is created.
  """
  # 1. Setup: Register and Create Dashboard
  email = f"clone_{uuid.uuid4()}@example.com"
  pwd = "pw"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token_res = await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
  headers = {"Authorization": f"Bearer {token_res.json()['access_token']}"}

  # Create Source Dash
  source_res = await client.post("/api/v1/dashboards/", json={"name": "Source"}, headers=headers)
  source_id = source_res.json()["id"]

  # Add Widget to Source
  widget_config = {"query": "SELECT 1", "x": 5}
  await client.post(
    f"/api/v1/dashboards/{source_id}/widgets",
    json={"title": "Widget A", "type": "SQL", "visualization": "table", "config": widget_config},
    headers=headers,
  )

  # 2. Perform Clone
  clone_res = await client.post(f"/api/v1/dashboards/{source_id}/clone", headers=headers)
  assert clone_res.status_code == 200
  clone_data = clone_res.json()

  # 3. Verification
  # ID should be different
  assert clone_data["id"] != source_id
  # Name should be prefixed
  assert clone_data["name"] == "Copy of Source"
  # Widgets should be cloned
  assert len(clone_data["widgets"]) == 1
  assert clone_data["widgets"][0]["title"] == "Widget A"
  assert clone_data["widgets"][0]["config"]["x"] == 5
  # Widget ID should be different (Deep Copy)
  assert clone_data["widgets"][0]["id"] != source_res.json().get("widgets", [])
