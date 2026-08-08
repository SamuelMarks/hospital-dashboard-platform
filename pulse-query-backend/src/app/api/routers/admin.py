"""API router for administrative configuration and operations."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.i18n import get_translated_message
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse, AdminSettingsUpdateRequest
from app.services.admin import get_admin_settings, update_admin_settings

router = APIRouter()


def require_admin(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> User:
  """Dependency to check if the current user has administrative privileges."""
  if not current_user.is_admin:
    msg = get_translated_message(
      accept_language or current_user.language_preference, "error.admin_required", "Admin privileges required."
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
  return current_user


@router.get("/settings", response_model=AdminSettingsResponse)
async def read_admin_settings(
  db: Annotated[AsyncSession, Depends(get_db)], current_user: Annotated[User, Depends(require_admin)]
) -> AdminSettingsResponse:
  """Get system-wide admin settings like API keys and visible models."""
  return await get_admin_settings(db)


@router.put("/settings", response_model=AdminSettingsResponse)
async def write_admin_settings(
  request: AdminSettingsUpdateRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
) -> AdminSettingsResponse:
  """Update system-wide admin settings like API keys and visible models."""
  return await update_admin_settings(db, request)
