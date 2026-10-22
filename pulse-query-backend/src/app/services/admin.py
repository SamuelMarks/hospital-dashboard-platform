"""Service for managing admin configuration."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_setting import AdminSetting
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest
from app.services.llm_client import llm_client

logger = logging.getLogger(__name__)


async def get_admin_settings(db: AsyncSession) -> AdminSettingsResponse:
  """
  Retrieves the current admin settings from the database.

  Args:
      db (AsyncSession): Active database session.

  Returns:
      AdminSettingsResponse: Current `api_keys` and `visible_models` configuration.
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

  return AdminSettingsResponse(api_keys=api_keys, visible_models=visible_models)


async def update_admin_settings(db: AsyncSession, request: AdminSettingsUpdateRequest) -> AdminSettingsResponse:
  """
  Updates the admin settings in the database and reloads the active LLM swarm.

  Args:
      db (AsyncSession): Active database session.
      request (AdminSettingsUpdateRequest): Updated `api_keys` and `visible_models`.

  Returns:
      AdminSettingsResponse: Updated admin settings state.
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
  new_settings = await get_admin_settings(db)
  try:
    llm_client.reload_swarm(new_settings)
  except Exception as exc:
    logger.warning(f"Failed to reload LLM swarm after admin settings update: {exc}")
  return new_settings
