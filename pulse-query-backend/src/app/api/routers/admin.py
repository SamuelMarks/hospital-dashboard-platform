"""API router for administrative configuration and operations."""

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok, unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest
from app.schemas.ai import LlmConnectionTestRequest, LlmProviderHealthResponse
from app.services.admin import admin_service
from app.services.llm.health_probe import probe_connection_request_result
from app.services.llm_client import llm_client

logger = logging.getLogger(__name__)
router = APIRouter()


def verify_admin_key(provided_key: str | None, expected_key: str | None) -> AppResult[bool]:
  """
  Performs a constant-time comparison of an administrative API key using `secrets.compare_digest`.

  Args:
      provided_key (str | None): Key supplied by the client (e.g. via `X-Admin-Key` header).
      expected_key (str | None): Configured server admin key.

  Returns:
      AppResult[bool]: `Ok(True)` if both keys are non-empty and match, else `Err(AppError)`.
  """
  if not provided_key or not expected_key:
    return Err(
      AppError(
        code=ErrorCode.ADMIN_INVALID_SECRET,
        message="Admin privileges required.",
        status_code=status.HTTP_403_FORBIDDEN,
      )
    )
  if not secrets.compare_digest(provided_key.encode("utf-8"), expected_key.encode("utf-8")):
    return Err(
      AppError(
        code=ErrorCode.ADMIN_INVALID_SECRET,
        message="Admin privileges required.",
        status_code=status.HTTP_403_FORBIDDEN,
      )
    )
  return Ok(True)


def require_admin_result(
  current_user: User,
  accept_language: str | None = None,
) -> AppResult[User]:
  """
  Verifies that `current_user` holds administrative privileges, returning an `AppResult[User]`.

  Args:
      current_user (User): Authenticated user model instance.
      accept_language (str | None): Optional HTTP `Accept-Language` header.

  Returns:
      AppResult[User]: `Ok(current_user)` if admin, else `Err(AppError)` with localized message.
  """
  if not current_user.is_admin:
    msg = get_translated_message(
      accept_language or current_user.language_preference, "error.admin_required", "Admin privileges required."
    )
    return Err(
      AppError(
        code=ErrorCode.AUTHORIZATION_ERROR,
        message=msg,
        status_code=status.HTTP_403_FORBIDDEN,
      )
    )
  return Ok(current_user)


def require_admin(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> User:
  """
  Dependency to check if the current user has administrative privileges.

  Args:
      current_user (User): Authenticated user model instance.
      accept_language (str | None): Optional HTTP `Accept-Language` header.

  Returns:
      User: Verified administrative user.

  Raises:
      HTTPException: 403 Forbidden if user is not an administrator.
  """
  return unwrap_or_raise_http(require_admin_result(current_user, accept_language=accept_language))


@router.get("/settings", response_model=AdminSettingsResponse)
async def read_admin_settings(
  db: Annotated[AsyncSession, Depends(get_db)], current_user: Annotated[User, Depends(require_admin)]
) -> AdminSettingsResponse:
  """
  Get system-wide admin settings like API keys and visible models.

  Args:
      db (AsyncSession): Active PostgreSQL session.
      current_user (User): Authenticated administrator.

  Returns:
      AdminSettingsResponse: Current admin settings state.
  """
  logger.debug(f"Reading admin settings for admin={current_user.id}")
  return unwrap_or_raise_http(await admin_service.get_admin_settings_result(db))


@router.put("/settings", response_model=AdminSettingsResponse)
async def write_admin_settings(
  request: AdminSettingsUpdateRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
) -> AdminSettingsResponse:
  """
  Update system-wide admin settings like API keys and visible models.

  Args:
      request (AdminSettingsUpdateRequest): Updated admin settings payload.
      db (AsyncSession): Active PostgreSQL session.
      current_user (User): Authenticated administrator.

  Returns:
      AdminSettingsResponse: Updated admin settings state.
  """
  logger.debug(f"Updating admin settings for admin={current_user.id}")
  return unwrap_or_raise_http(await admin_service.update_admin_settings_result(db, request))


@router.post("/llm/test-connection", response_model=LlmProviderHealthResponse)
async def test_llm_connection(
  request: LlmConnectionTestRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
) -> LlmProviderHealthResponse:
  """
  Tests connectivity and optional 1-token smoke inference for an LLM provider or model configuration.

  Args:
      request (LlmConnectionTestRequest): Provider, model, and optional override credentials.
      db (AsyncSession): Active PostgreSQL session.
      current_user (User): Authenticated administrator.

  Returns:
      LlmProviderHealthResponse: Connection health status, latency, and remediation steps.
  """
  logger.debug(f"Admin testing LLM connection provider={request.provider} admin={current_user.id}")
  admin_settings_res = await admin_service.get_admin_settings_result(db)
  admin_settings = admin_settings_res.value if isinstance(admin_settings_res, Ok) else None
  return unwrap_or_raise_http(
    await probe_connection_request_result(
      request=request,
      admin_settings=admin_settings,
      arena_client=llm_client,
    )
  )
