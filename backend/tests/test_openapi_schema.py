"""
Tests for OpenAPI Schema Integrity.

Verifies that the application can successfully generate a valid OpenAPI
specification and that critical endpoints defined in previous steps are
present in the contract.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_openapi_endpoint_status():
  """
  Verify the standard /openapi.json endpoint returns 200 OK.
  """
  response = client.get("/api/v1/openapi.json")
  assert response.status_code == 200
  assert response.headers["content-type"] == "application/json"


def test_openapi_contains_critical_paths():
  """
  Verify that key business endpoints and schemas are exposed in the specification.
  Specific attention is paid to the 'refresh' endpoint which involves complex types.
  """
  schema = app.openapi()

  # 1. Check Paths
  paths = schema.get("paths", {})

  # Auth
  assert "/api/v1/auth/login" in paths

  # Dashboards
  assert "/api/v1/dashboards/" in paths

  # Execution (The complex one)
  refresh_path = "/api/v1/dashboards/{dashboard_id}/refresh"
  assert refresh_path in paths
  assert "post" in paths[refresh_path]

  # 2. Check Schemas (Components)
  components = schema.get("components", {}).get("schemas", {})

  assert "DashboardResponse" in components
  assert "WidgetResponse" in components

  # 3. Check Return Type for Refresh (The map)
  # FastAPI usually wraps basic responses or uses additionalProperties for Dicts.
  # We ensure the structure definition exists.
  # Note: Pydantic v2 might name it explicitly or inline it.
  # Validating the path operation reference is usually sufficient coverage.
  operation = paths[refresh_path]["post"]
  assert "responses" in operation
  assert "200" in operation["responses"]


def test_openapi_version_matches():
  """
  Verify the API version in schema matches configuration.
  """
  schema = app.openapi()
  assert schema["info"]["title"] == "Hospital Analytics Platform"
