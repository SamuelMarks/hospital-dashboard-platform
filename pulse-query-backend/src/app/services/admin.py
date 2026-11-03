"""
Admin Configuration Domain Service Module.

Encapsulates reading and updating system-wide administrative settings
(`api_keys`, `visible_models`, `configured_models`, `ollama_api_base`, and `gemma-4-sql` settings)
using explicit `AppResult[AdminSettingsResponse]` return values and hot-reloading the LLM Arena swarm.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppResult, Err, Ok, unwrap_or_raise_http
from app.models.admin_setting import AdminSetting
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest
from app.schemas.json_types import JsonValue
from app.services.llm_client import llm_client

logger = logging.getLogger(__name__)

_ADMIN_SETTING_KEYS: tuple[str, ...] = (
  "api_keys",
  "visible_models",
  "configured_models",
  "ollama_api_base",
  "gemma4_sql_enabled",
  "gemma4_sql_backend",
  "gemma4_sql_model_name",
  "gemma4_sql_api_base",
)


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
            `configured_models`, `ollama_api_base`, and `gemma-4-sql` settings.
    """
    stmt = select(AdminSetting).where(AdminSetting.setting_key.in_(_ADMIN_SETTING_KEYS))
    result = await db.execute(stmt)
    settings_rows = result.scalars().all()

    api_keys: dict[str, str] = {}
    visible_models: list[str] = []
    configured_models: list[str] = []
    ollama_api_base: str | None = None
    gemma4_sql_enabled = True
    gemma4_sql_backend = "mlx"
    gemma4_sql_model_name = "google/gemma-4-sql-9b"
    gemma4_sql_api_base: str | None = None

    for setting in settings_rows:
      raw_val = setting.setting_value
      key = setting.setting_key
      if key == "api_keys":
        api_keys = {str(k): str(v) for k, v in raw_val.items()} if isinstance(raw_val, dict) else {}
      elif key == "visible_models":
        visible_models = [str(item) for item in raw_val] if isinstance(raw_val, list) else []
      elif key == "configured_models":
        configured_models = [str(item) for item in raw_val] if isinstance(raw_val, list) else []
      elif key == "ollama_api_base":
        ollama_api_base = str(raw_val) if isinstance(raw_val, str) and raw_val.strip() else None
      elif key == "gemma4_sql_enabled":
        gemma4_sql_enabled = bool(raw_val)
      elif key == "gemma4_sql_backend":
        gemma4_sql_backend = str(raw_val) if isinstance(raw_val, str) and raw_val.strip() else "mlx"
      elif key == "gemma4_sql_model_name":
        gemma4_sql_model_name = str(raw_val) if isinstance(raw_val, str) and raw_val.strip() else "google/gemma-4-sql-9b"
      else:
        gemma4_sql_api_base = str(raw_val) if isinstance(raw_val, str) and raw_val.strip() else None

    return Ok(
      AdminSettingsResponse(
        api_keys=api_keys,
        visible_models=visible_models,
        configured_models=configured_models,
        ollama_api_base=ollama_api_base,
        gemma4_sql_enabled=gemma4_sql_enabled,
        gemma4_sql_backend=gemma4_sql_backend,
        gemma4_sql_model_name=gemma4_sql_model_name,
        gemma4_sql_api_base=gemma4_sql_api_base,
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
        request (AdminSettingsUpdateRequest): Updated `api_keys`, `visible_models`, `configured_models`,
            `ollama_api_base`, and `gemma-4-sql` configuration.

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
    if request.gemma4_sql_enabled is not None:
      await self._upsert_setting(db, "gemma4_sql_enabled", request.gemma4_sql_enabled)
    if request.gemma4_sql_backend is not None:
      await self._upsert_setting(db, "gemma4_sql_backend", request.gemma4_sql_backend)
    if request.gemma4_sql_model_name is not None:
      await self._upsert_setting(db, "gemma4_sql_model_name", request.gemma4_sql_model_name)
    if request.gemma4_sql_api_base is not None:
      await self._upsert_setting(db, "gemma4_sql_api_base", request.gemma4_sql_api_base)

    await db.commit()
    new_settings_res = await self.get_admin_settings_result(db)
    if isinstance(new_settings_res, Err):
      return new_settings_res
    new_settings = new_settings_res.value
    try:
      llm_client.reload_swarm(new_settings)
    except (RuntimeError, ValueError, TypeError, OSError, KeyError) as exc:
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
