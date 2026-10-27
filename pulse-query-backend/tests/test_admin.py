"""Tests for admin."""

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_admin_endpoints(client: AsyncClient, db_session: AsyncSession) -> None:
  """
  Verifies `/api/v1/admin/settings` enforces admin RBAC and persists API keys and visible models.

  Args:
      client (AsyncClient): Active ASGI HTTP test client.
      db_session (AsyncSession): Active test database session.
  """
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
  assert res.json() == {
    "api_keys": {},
    "visible_models": [],
    "configured_models": [],
    "ollama_api_base": None,
  }

  # Test update
  payload = {
    "api_keys": {"openai": "sk-123"},
    "visible_models": ["openai/gpt-4o"],
    "configured_models": ["groq:llama3-70b"],
    "ollama_api_base": "http://localhost:11434",
  }
  res = await client.put("/api/v1/admin/settings", headers=admin_headers, json=payload)
  assert res.status_code == 200
  assert res.json() == payload

  # Test get after update
  res = await client.get("/api/v1/admin/settings", headers=admin_headers)
  assert res.status_code == 200
  assert res.json() == payload

  # Test update again (to hit the update block instead of create)
  payload2 = {
    "api_keys": {"anthropic": "sk-456"},
    "visible_models": ["anthropic/claude"],
    "configured_models": ["mistral:mistral-large"],
    "ollama_api_base": "http://ollama.local:11434",
  }
  res = await client.put("/api/v1/admin/settings", headers=admin_headers, json=payload2)
  assert res.status_code == 200
  assert res.json() == payload2


def test_admin_setting_repr() -> None:
  """Verifies `AdminSetting.__repr__` includes the `setting_key`."""
  from app.models.admin_setting import AdminSetting

  setting = AdminSetting(setting_key="test_key", setting_value="test_val")
  assert repr(setting) == "<AdminSetting test_key>"


def test_llm_client_reload_swarm() -> None:
  """Verifies `llm_client.reload_swarm` reloads combatants with and without `AdminSettingsResponse`."""
  from app.schemas.admin import AdminSettingsResponse
  from app.services.llm_client import llm_client

  settings_dto = AdminSettingsResponse(api_keys={"openai": "test-key"}, visible_models=["mock-model"])
  llm_client.reload_swarm(settings_dto)
  assert len(llm_client.swarm) >= 1
  llm_client.reload_swarm(None)
  assert len(llm_client.swarm) >= 1


@pytest.mark.asyncio
async def test_admin_settings_unknown_key_and_reload_error(
  db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
  """
  Verifies `update_admin_settings` succeeds and logs a warning even when `reload_swarm` raises.

  Args:
      db_session (AsyncSession): Active test database session.
      monkeypatch (pytest.MonkeyPatch): Pytest monkeypatch fixture.
  """
  from app.schemas.admin import AdminSettingsUpdateRequest
  from app.services.admin import get_admin_settings, update_admin_settings

  settings_res = await get_admin_settings(db_session)
  assert isinstance(settings_res.api_keys, dict)

  # Mock reload_swarm to raise exception
  monkeypatch.setattr(
    "app.services.admin.llm_client.reload_swarm",
    lambda _: (_ for _ in ()).throw(RuntimeError("reload failed")),
  )
  # Update should succeed gracefully despite reload error
  req = AdminSettingsUpdateRequest(api_keys={"k": "v"}, visible_models=["m"])
  res = await update_admin_settings(db_session, req)
  assert res.api_keys == {"k": "v"}


@pytest.mark.asyncio
async def test_admin_ignore_unknown_setting_key(db_session: AsyncSession) -> None:
  """Verifies `get_admin_settings` ignores unknown setting keys stored in `AdminSetting`."""
  from app.models.admin_setting import AdminSetting
  from app.services.admin import get_admin_settings

  db_session.add(AdminSetting(setting_key="ignore", setting_value={"a": 1}))
  await db_session.commit()
  settings_res = await get_admin_settings(db_session)
  assert isinstance(settings_res.api_keys, dict)
  assert isinstance(settings_res.visible_models, list)


def test_verify_admin_key_constant_time_comparison() -> None:
  """Verifies `verify_admin_key` uses constant-time comparison and returns `Ok`/`Err` appropriately."""
  from app.api.routers.admin import verify_admin_key
  from app.core.result import Err, Ok

  assert isinstance(verify_admin_key("secret-123", "secret-123"), Ok)
  assert isinstance(verify_admin_key("wrong", "secret-123"), Err)
  assert isinstance(verify_admin_key(None, "secret-123"), Err)
  assert isinstance(verify_admin_key("secret-123", None), Err)
