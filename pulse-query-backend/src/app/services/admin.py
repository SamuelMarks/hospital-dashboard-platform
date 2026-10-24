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
        AppResult[AdminSettingsResponse]: `Ok(AdminSettingsResponse)` containing `api_keys` and `visible_models`.
    """
    stmt = select(AdminSetting).where(AdminSetting.setting_key.in_(["api_keys", "visible_models"]))
    result = await db.execute(stmt)
    settings = result.scalars().all()

    api_keys: dict[str, str] = {}
    visible_models: list[str] = []

    for setting in settings:
      if setting.setting_key == "api_keys":
        api_keys = setting.setting_value or {}
      else:
        visible_models = setting.setting_value or []

    return Ok(AdminSettingsResponse(api_keys=api_keys, visible_models=visible_models))

  async def update_admin_settings_result(
    self,
    db: AsyncSession,
    request: AdminSettingsUpdateRequest,
  ) -> AppResult[AdminSettingsResponse]:
    """
    Updates the admin settings in the database and reloads the active LLM swarm.

    Args:
        db (AsyncSession): Active database session.
        request (AdminSettingsUpdateRequest): Updated `api_keys` and `visible_models`.

    Returns:
        AppResult[AdminSettingsResponse]: `Ok(AdminSettingsResponse)` containing updated state.
    """
    stmt = select(AdminSetting).where(AdminSetting.setting_key == "api_keys")
    result = await db.execute(stmt)
    api_keys_setting = result.scalar_one_or_none()

    if api_keys_setting:
      api_keys_setting.setting_value = request.api_keys
    else:
      api_keys_setting = AdminSetting(setting_key="api_keys", setting_value=request.api_keys)
      db.add(api_keys_setting)

    stmt = select(AdminSetting).where(AdminSetting.setting_key == "visible_models")
    result = await db.execute(stmt)
    visible_models_setting = result.scalar_one_or_none()

    if visible_models_setting:
      visible_models_setting.setting_value = request.visible_models
    else:
      visible_models_setting = AdminSetting(setting_key="visible_models", setting_value=request.visible_models)
      db.add(visible_models_setting)

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
