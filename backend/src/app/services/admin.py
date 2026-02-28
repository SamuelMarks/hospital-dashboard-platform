"""Service for managing admin configuration."""

from typing import Dict, List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_setting import AdminSetting
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest


async def get_admin_settings(db: AsyncSession) -> AdminSettingsResponse:
  """Retrieves the current admin settings from the database."""
  stmt = select(AdminSetting).where(AdminSetting.setting_key.in_(["api_keys", "visible_models"]))
  result = await db.execute(stmt)
  settings = result.scalars().all()

  api_keys = {}
  visible_models = []

  for setting in settings:
    if setting.setting_key == "api_keys" and setting.setting_value:
      api_keys = setting.setting_value
    elif setting.setting_key == "visible_models" and setting.setting_value:
      visible_models = setting.setting_value

  return AdminSettingsResponse(api_keys=api_keys, visible_models=visible_models)


async def update_admin_settings(db: AsyncSession, request: AdminSettingsUpdateRequest) -> AdminSettingsResponse:
  """Updates the admin settings in the database."""
  # Handle api_keys
  stmt = select(AdminSetting).where(AdminSetting.setting_key == "api_keys")
  result = await db.execute(stmt)
  api_keys_setting = result.scalar_one_or_none()

  if api_keys_setting:
    api_keys_setting.setting_value = request.api_keys
  else:
    api_keys_setting = AdminSetting(setting_key="api_keys", setting_value=request.api_keys)
    db.add(api_keys_setting)

  # Handle visible_models
  stmt = select(AdminSetting).where(AdminSetting.setting_key == "visible_models")
  result = await db.execute(stmt)
  visible_models_setting = result.scalar_one_or_none()

  if visible_models_setting:
    visible_models_setting.setting_value = request.visible_models
  else:
    visible_models_setting = AdminSetting(setting_key="visible_models", setting_value=request.visible_models)
    db.add(visible_models_setting)

  await db.commit()
  return await get_admin_settings(db)
