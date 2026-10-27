"""
Admin Configuration Domain Service Module.

Encapsulates reading and updating system-wide administrative settings
(`api_keys` and `visible_models`) using explicit `AppResult[AdminSettingsResponse]`
return values and hot-reloading the LLM Arena swarm.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppResult, Ok, unwrap_or_raise_http
from app.models.admin_setting import AdminSetting
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest
from app.schemas.json_types import JsonValue
from app.services.llm_client import llm_client

logger = logging.getLogger(__name__)


class AdminService:
  """
  Domain service managing system-wide administrative settings and LLM swarm reloads.
  """

  async def get_admin_settings_result(
    self,
    db: AsyncSession,
  ) -> AppResult[AdminSettingsResponse]:
    """
    Retrieves the current admin settings from the database wrapped in `AppResult`.

    Args:
        db (AsyncSession): Active database session.

    Returns:
        AppResult[AdminSettingsResponse]: `Ok(AdminSettingsResponse)` containing `api_keys`, `visible_models`,
            `configured_models`, and `ollama_api_base`.
    """
    stmt = select(AdminSetting).where(
      AdminSetting.setting_key.in_(["api_keys", "visible_models", "configured_models", "ollama_api_base"])
    )
    result = await db.execute(stmt)
    settings = result.scalars().all()

    api_keys: dict[str, str] = {}
    visible_models: list[str] = []
    configured_models: list[str] = []
    ollama_api_base: str | None = None

    for setting in settings:
      raw_val = setting.setting_value
      if setting.setting_key == "api_keys":
        api_keys = {str(k): str(v) for k, v in raw_val.items()} if isinstance(raw_val, dict) else {}
      elif setting.setting_key == "visible_models":
        visible_models = [str(item) for item in raw_val] if isinstance(raw_val, list) else []
      elif setting.setting_key == "configured_models":
        configured_models = [str(item) for item in raw_val] if isinstance(raw_val, list) else []
      else:
        ollama_api_base = str(raw_val) if isinstance(raw_val, str) and raw_val.strip() else None

    return Ok(
      AdminSettingsResponse(
        api_keys=api_keys,
        visible_models=visible_models,
        configured_models=configured_models,
        ollama_api_base=ollama_api_base,
      )
    )

  async def _upsert_setting(self, db: AsyncSession, key: str, value: JsonValue) -> None:
    """
    Inserts or updates a single `AdminSetting` row in `db`.

    Args:
        db (AsyncSession): Active database session.
        key (str): Setting key name.
        value (JsonValue): JSON-serializable setting value.
    """
    stmt = select(AdminSetting).where(AdminSetting.setting_key == key)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
      existing.setting_value = value
    else:
      db.add(AdminSetting(setting_key=key, setting_value=value))

  async def update_admin_settings_result(
    self,
    db: AsyncSession,
    request: AdminSettingsUpdateRequest,
  ) -> AppResult[AdminSettingsResponse]:
    """
    Updates the admin settings in the database and reloads the active LLM swarm.

    Args:
        db (AsyncSession): Active database session.
        request (AdminSettingsUpdateRequest): Updated `api_keys`, `visible_models`, `configured_models`, and `ollama_api_base`.

    Returns:
        AppResult[AdminSettingsResponse]: `Ok(AdminSettingsResponse)` containing updated state.
    """
    api_keys_val: JsonValue = {str(k): str(v) for k, v in request.api_keys.items()}
    visible_val: JsonValue = [str(item) for item in request.visible_models]
    await self._upsert_setting(db, "api_keys", api_keys_val)
    await self._upsert_setting(db, "visible_models", visible_val)
    if request.configured_models is not None:
      configured_val: JsonValue = [str(item) for item in request.configured_models]
      await self._upsert_setting(db, "configured_models", configured_val)
    if request.ollama_api_base is not None:
      await self._upsert_setting(db, "ollama_api_base", request.ollama_api_base)

    await db.commit()
    new_settings_res = await self.get_admin_settings_result(db)
    new_settings = unwrap_or_raise_http(new_settings_res)
    try:
      llm_client.reload_swarm(new_settings)
    except Exception as exc:
      logger.warning(f"Failed to reload LLM swarm after admin settings update: {exc}")
    return Ok(new_settings)


admin_service = AdminService()


async def get_admin_settings(db: AsyncSession) -> AdminSettingsResponse:
  """
  Retrieves the current admin settings from the database.

  Args:
      db (AsyncSession): Active database session.

  Returns:
      AdminSettingsResponse: Current `api_keys` and `visible_models` configuration.
  """
  return unwrap_or_raise_http(await admin_service.get_admin_settings_result(db))


async def update_admin_settings(db: AsyncSession, request: AdminSettingsUpdateRequest) -> AdminSettingsResponse:
  """
  Updates the admin settings in the database and reloads the active LLM swarm.

  Args:
      db (AsyncSession): Active database session.
      request (AdminSettingsUpdateRequest): Updated `api_keys` and `visible_models`.

  Returns:
      AdminSettingsResponse: Updated admin settings state.
  """
  return unwrap_or_raise_http(await admin_service.update_admin_settings_result(db, request))
