"""
Tests for Clinical Alert Rules API Router.

Verifies full CRUD lifecycle for hospital capacity alerting thresholds:
- Listing existing rules
- Creating new rules with validation
- Fetching specific rules
- Updating rule thresholds, categories, severities, and active states
- Deleting rules and handling 404 edge cases
"""

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.main import app
from app.models.user import User

BASE_URL = "/api/v1/analytics/alert-rules"


@pytest.fixture
def mock_auth_user():
  """Provides a mock authenticated user overriding get_current_user."""
  user = MagicMock(spec=User)
  user.id = uuid.uuid4()
  user.email = "analyst@hospital.org"
  user.role = "DATA_ANALYST"
  user.is_active = True

  app.dependency_overrides[get_current_user] = lambda: user
  try:
    yield user
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_alert_rules_crud_lifecycle(client: AsyncClient, mock_auth_user) -> None:
  """Test full create, read, update, list, and delete lifecycle of an AlertRule."""
  # 1. Initially empty or existing rules
  res_list = await client.get(BASE_URL)
  assert res_list.status_code == 200
  initial_count = len(res_list.json())

  # 2. Create a new alert rule
  create_payload = {
    "unit_category": "Emergency Room",
    "threshold_percentage": 85.5,
    "severity": "WARNING",
    "is_active": True,
  }
  res_create = await client.post(BASE_URL, json=create_payload)
  assert res_create.status_code == 201
  created_data = res_create.json()
  rule_id = created_data["id"]
  assert created_data["unit_category"] == "Emergency Room"
  assert created_data["threshold_percentage"] == 85.5
  assert created_data["severity"] == "WARNING"
  assert created_data["is_active"] is True

  # 3. Retrieve single alert rule
  res_get = await client.get(f"{BASE_URL}/{rule_id}")
  assert res_get.status_code == 200
  assert res_get.json()["id"] == rule_id

  # 4. Update alert rule partially (threshold & severity)
  update_payload = {
    "threshold_percentage": 92.0,
    "severity": "CRITICAL",
    "is_active": False,
    "unit_category": "Trauma ICU",
  }
  res_update = await client.put(f"{BASE_URL}/{rule_id}", json=update_payload)
  assert res_update.status_code == 200
  updated_data = res_update.json()
  assert updated_data["threshold_percentage"] == 92.0
  assert updated_data["severity"] == "CRITICAL"
  assert updated_data["is_active"] is False
  assert updated_data["unit_category"] == "Trauma ICU"

  # 4b. Empty partial update leaves fields unchanged (tests is None branches)
  res_empty_update = await client.put(f"{BASE_URL}/{rule_id}", json={})
  assert res_empty_update.status_code == 200
  assert res_empty_update.json()["threshold_percentage"] == 92.0

  # 5. List rules verifies update
  res_list_after = await client.get(BASE_URL)
  assert res_list_after.status_code == 200
  assert len(res_list_after.json()) == initial_count + 1

  # 6. Delete alert rule
  res_delete = await client.delete(f"{BASE_URL}/{rule_id}")
  assert res_delete.status_code == 204

  # 7. Verify deletion
  res_get_deleted = await client.get(f"{BASE_URL}/{rule_id}")
  assert res_get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_alert_rules_validation_errors(client: AsyncClient, mock_auth_user) -> None:
  """Test validation constraints on alert rule creation."""
  # Threshold > 100
  res_over = await client.post(
    BASE_URL,
    json={
      "unit_category": "ICU",
      "threshold_percentage": 105.0,
      "severity": "CRITICAL",
    },
  )
  assert res_over.status_code == 422

  # Threshold < 1
  res_under = await client.post(
    BASE_URL,
    json={
      "unit_category": "ICU",
      "threshold_percentage": 0.5,
      "severity": "CRITICAL",
    },
  )
  assert res_under.status_code == 422

  # Empty category
  res_empty = await client.post(
    BASE_URL,
    json={
      "unit_category": "",
      "threshold_percentage": 80.0,
      "severity": "WARNING",
    },
  )
  assert res_empty.status_code == 422


@pytest.mark.asyncio
async def test_alert_rules_not_found_branches(client: AsyncClient, mock_auth_user) -> None:
  """Test 404 error responses for non-existent alert rule operations."""
  non_existent_id = uuid.uuid4()
  # Get non-existent
  res_get = await client.get(f"{BASE_URL}/{non_existent_id}")
  assert res_get.status_code == 404
  assert "not found" in res_get.json()["detail"].lower()

  # Update non-existent
  res_put = await client.put(f"{BASE_URL}/{non_existent_id}", json={"threshold_percentage": 75.0})
  assert res_put.status_code == 404

  # Delete non-existent
  res_del = await client.delete(f"{BASE_URL}/{non_existent_id}")
  assert res_del.status_code == 404
