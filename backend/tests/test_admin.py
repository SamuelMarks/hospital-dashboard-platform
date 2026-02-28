import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.user import User


@pytest.mark.asyncio
async def test_admin_endpoints(client: AsyncClient, db_session: AsyncSession):
  # 1. Register a normal user
  await client.post("/api/v1/auth/register", json={"email": "normal@example.com", "password": "pass"})
  res = await client.post("/api/v1/auth/login", data={"username": "normal@example.com", "password": "pass"})
  normal_token = res.json()["access_token"]
  normal_headers = {"Authorization": f"Bearer {normal_token}"}

  # 2. Register an admin user and manually set is_admin=True in DB
  await client.post("/api/v1/auth/register", json={"email": "admin@example.com", "password": "pass"})
  stmt = update(User).where(User.email == "admin@example.com").values(is_admin=True)
  await db_session.execute(stmt)
  await db_session.commit()

  res = await client.post("/api/v1/auth/login", data={"username": "admin@example.com", "password": "pass"})
  admin_token = res.json()["access_token"]
  admin_headers = {"Authorization": f"Bearer {admin_token}"}

  # Test unauthorized access
  res = await client.get("/api/v1/admin/settings", headers=normal_headers)
  assert res.status_code == 403

  res = await client.put("/api/v1/admin/settings", headers=normal_headers, json={"api_keys": {}, "visible_models": []})
  assert res.status_code == 403

  # Test authorized access (get initial)
  res = await client.get("/api/v1/admin/settings", headers=admin_headers)
  assert res.status_code == 200
  assert res.json() == {"api_keys": {}, "visible_models": []}

  # Test update
  payload = {"api_keys": {"openai": "sk-123"}, "visible_models": ["openai/gpt-4o"]}
  res = await client.put("/api/v1/admin/settings", headers=admin_headers, json=payload)
  assert res.status_code == 200
  assert res.json() == payload

  # Test get after update
  res = await client.get("/api/v1/admin/settings", headers=admin_headers)
  assert res.status_code == 200
  assert res.json() == payload

  # Test update again (to hit the update block instead of create)
  payload2 = {"api_keys": {"anthropic": "sk-456"}, "visible_models": ["anthropic/claude"]}
  res = await client.put("/api/v1/admin/settings", headers=admin_headers, json=payload2)
  assert res.status_code == 200
  assert res.json() == payload2


def test_admin_setting_repr():
  from app.models.admin_setting import AdminSetting

  setting = AdminSetting(setting_key="test_key", setting_value="test_val")
  assert repr(setting) == "<AdminSetting test_key>"
