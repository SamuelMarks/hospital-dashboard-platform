"""
Tests for User Administration API Router.

Validates administrative operations including listing users, filtering by role,
updating clinical roles, and account suspension/activation logic.
"""

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.main import app
from app.models.user import Role, User

BASE_URL = "/api/v1/admin/users"


@pytest.fixture
def admin_user():
  """Provides a mock admin user for privileged operations."""
  user = MagicMock(spec=User)
  user.id = uuid.uuid4()
  user.email = "admin@hospital.org"
  user.role = "SUPER_ADMIN"
  user.is_admin = True
  user.is_active = True
  user.language_preference = "en"

  app.dependency_overrides[get_current_user] = lambda: user
  try:
    yield user
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_list_users_with_filtering(client: AsyncClient, admin_user, db_session) -> None:
  """Test listing users, role filtering, and email substring search."""
  # Seed multiple users with distinct roles
  u1 = User(
    id=uuid.uuid4(),
    email="doctor1@hospital.org",
    role="ATTENDING_PHYSICIAN",
    is_active=True,
    is_admin=False,
    hashed_password="pw",
  )
  u2 = User(
    id=uuid.uuid4(),
    email="nurse1@hospital.org",
    role="CHARGE_NURSE",
    is_active=True,
    is_admin=False,
    hashed_password="pw",
  )
  db_session.add_all([u1, u2])
  await db_session.commit()

  # List all
  res_all = await client.get(BASE_URL)
  assert res_all.status_code == 200
  emails = [u["email"] for u in res_all.json()]
  assert "doctor1@hospital.org" in emails
  assert "nurse1@hospital.org" in emails

  # Filter by role
  res_nurse = await client.get(f"{BASE_URL}?role=CHARGE_NURSE")
  assert res_nurse.status_code == 200
  nurse_emails = [u["email"] for u in res_nurse.json()]
  assert "nurse1@hospital.org" in nurse_emails
  assert "doctor1@hospital.org" not in nurse_emails

  # Filter by search
  res_search = await client.get(f"{BASE_URL}?search=doctor")
  assert res_search.status_code == 200
  search_emails = [u["email"] for u in res_search.json()]
  assert "doctor1@hospital.org" in search_emails
  assert "nurse1@hospital.org" not in search_emails


@pytest.mark.asyncio
async def test_non_admin_forbidden(client: AsyncClient) -> None:
  """Non-admin user should receive 403 Forbidden on admin user endpoints."""
  normal_user = MagicMock(spec=User)
  normal_user.id = uuid.uuid4()
  normal_user.email = "nurse@hospital.org"
  normal_user.role = "CHARGE_NURSE"
  normal_user.is_admin = False
  normal_user.is_active = True
  normal_user.language_preference = "en"

  app.dependency_overrides[get_current_user] = lambda: normal_user
  try:
    res = await client.get(BASE_URL)
    assert res.status_code == 403
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_update_user_role_lifecycle(client: AsyncClient, admin_user, db_session) -> None:
  """Test updating user role to valid, invalid, and SUPER_ADMIN roles."""
  target_user = User(
    id=uuid.uuid4(),
    email="analyst_target@hospital.org",
    role="DATA_ANALYST",
    is_active=True,
    is_admin=False,
    hashed_password="pw",
  )
  db_session.add(target_user)
  await db_session.commit()

  # Update to CHIEF_MEDICAL_OFFICER
  res_update = await client.put(
    f"{BASE_URL}/{target_user.id}/role",
    json={"role": "CHIEF_MEDICAL_OFFICER"},
  )
  assert res_update.status_code == 200
  assert res_update.json()["role"] == "CHIEF_MEDICAL_OFFICER"

  # Update to SUPER_ADMIN elevates is_admin
  res_super = await client.put(
    f"{BASE_URL}/{target_user.id}/role",
    json={"role": "SUPER_ADMIN"},
  )
  assert res_super.status_code == 200
  assert res_super.json()["role"] == "SUPER_ADMIN"
  assert res_super.json()["is_admin"] is True

  # Invalid role returns 400
  res_invalid = await client.put(
    f"{BASE_URL}/{target_user.id}/role",
    json={"role": "INVALID_ROLE"},
  )
  assert res_invalid.status_code == 400
  assert "invalid clinical role" in res_invalid.json()["detail"].lower()

  # Non-existent user returns 404
  res_missing = await client.put(
    f"{BASE_URL}/{uuid.uuid4()}/role",
    json={"role": "CHARGE_NURSE"},
  )
  assert res_missing.status_code == 404


@pytest.mark.asyncio
async def test_update_user_status_lifecycle(client: AsyncClient, admin_user, db_session) -> None:
  """Test suspending and activating accounts, preventing self-suspension."""
  target_user = User(
    id=uuid.uuid4(),
    email="suspend_target@hospital.org",
    role="ATTENDING_PHYSICIAN",
    is_active=True,
    is_admin=False,
    hashed_password="pw",
  )
  db_session.add(target_user)
  await db_session.commit()

  # Suspend account
  res_suspend = await client.put(
    f"{BASE_URL}/{target_user.id}/status",
    json={"is_active": False},
  )
  assert res_suspend.status_code == 200
  assert res_suspend.json()["is_active"] is False

  # Reactivate account
  res_activate = await client.put(
    f"{BASE_URL}/{target_user.id}/status",
    json={"is_active": True},
  )
  assert res_activate.status_code == 200
  assert res_activate.json()["is_active"] is True

  # Admin self-suspension prevented with 400
  res_self = await client.put(
    f"{BASE_URL}/{admin_user.id}/status",
    json={"is_active": False},
  )
  assert res_self.status_code == 400
  assert "cannot suspend their own active account" in res_self.json()["detail"].lower()

  # Non-existent user returns 404
  res_missing = await client.put(
    f"{BASE_URL}/{uuid.uuid4()}/status",
    json={"is_active": False},
  )
  assert res_missing.status_code == 404
