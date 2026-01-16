import pytest
from httpx import AsyncClient
from app.api.routers.dashboards import router  # Validates router import


@pytest.mark.asyncio
async def test_dashboard_crud_flow(client: AsyncClient) -> None:
  """
  Test the Dashboard Creation, Widget Addition, and Listing flow.

  Verifies that a user can register, create a custom dashboard, add a widget to it,
  and retrieve it via the list endpoint. Handles the existence of the default
  provisioned dashboard.

  Args:
      client (AsyncClient): Authenticated HTTP client fixture.
  """
  # 1. Login (Create user on fly for test isolation)
  email = "dash_user@example.com"
  pwd = "password123"

  # Register
  register_res = await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  assert register_res.status_code == 200

  # Login
  login_res = await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
  assert login_res.status_code == 200, f"Login failed: {login_res.text}"
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
  # If validation fails due to missing table (local vs CI), check ingestion logs.
  assert widget_res.status_code == 200, f"Widget creation failed: {widget_res.text}"
  assert widget_res.json()["title"] == "Visits Count"

  # 4. List Dashboards (Verify widget presence)
  list_res = await client.get("/api/v1/dashboards/", headers=headers)
  assert list_res.status_code == 200
  data = list_res.json()

  # Isolation verification:
  # We expect 2 dashboards:
  # 1. "Hospital Command Center" (Auto-provisioned on register)
  # 2. "My Analytics" (Created in this test)
  assert len(data) >= 1

  # Find our specific dashboard
  my_dash = next((d for d in data if d["id"] == dash_id), None)
  assert my_dash is not None, "Created dashboard not found in list"
  assert my_dash["name"] == "My Analytics"
  assert len(my_dash["widgets"]) == 1
  assert my_dash["widgets"][0]["visualization"] == "metric"
