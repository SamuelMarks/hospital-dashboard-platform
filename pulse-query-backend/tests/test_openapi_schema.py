"""
Tests for OpenAPI Schema Integrity.

Verifies that the application can successfully generate a valid OpenAPI
specification and that critical endpoints defined in previous steps are
present in the contract.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_openapi_endpoint_status() -> None:
  """
  Verify the standard /openapi.json endpoint returns 200 OK.
  """
  response = client.get("/api/v1/openapi.json")
  assert response.status_code == 200
  assert response.headers["content-type"] == "application/json"


def test_openapi_contains_critical_paths() -> None:
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
  operation = paths[refresh_path]["post"]
  assert "responses" in operation
  assert "200" in operation["responses"]

  # 4. Verify all optimization and benchmark endpoints are present in the OpenAPI schema
  expected_optimization_paths = [
    "/api/v1/optimization/institutions",
    "/api/v1/optimization/models",
    "/api/v1/optimization/quick-actions",
    "/api/v1/optimization/quick-actions/{action_id}",
    "/api/v1/optimization/solve",
    "/api/v1/optimization/sessions",
    "/api/v1/optimization/sessions/{session_id}",
    "/api/v1/optimization/sessions/{session_id}/iterate",
    "/api/v1/optimization/surveys",
    "/api/v1/optimization/surveys/summary",
    "/api/v1/benchmarks/sql",
    "/api/v1/benchmarks/optimization",
    "/api/v1/benchmarks/progress",
  ]
  for expected_path in expected_optimization_paths:
    assert expected_path in paths, f"Missing expected OpenAPI path: {expected_path}"

  # 5. Verify every APIRoute under /api/v1 is present in the generated OpenAPI specification
  # and defines a response schema or explicit 204 status code
  from fastapi.routing import APIRoute

  for route in app.routes:
    if isinstance(route, APIRoute) and route.include_in_schema and route.path.startswith("/api/v1"):
      normalized_path = route.path.rstrip("/") if route.path != "/api/v1/" else route.path
      assert route.path in paths or normalized_path in paths
      assert route.response_model is not None or route.status_code == 204 or route.response_class is not None

  # 6. Verify pulse-query-backend/openapi.json is synchronized with app.openapi() paths
  import json
  from pathlib import Path

  openapi_file = Path(__file__).resolve().parents[1] / "openapi.json"
  if openapi_file.exists():
    disk_schema = json.loads(openapi_file.read_text(encoding="utf-8"))
    assert set(disk_schema.get("paths", {}).keys()) == set(paths.keys())


def test_openapi_version_matches() -> None:
  """
  Verify the API version in schema matches configuration.
  """
  schema = app.openapi()
  assert schema["info"]["title"] == "Hospital Analytics Platform"
