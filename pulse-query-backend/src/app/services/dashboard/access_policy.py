"""
Dashboard access policy service evaluating ownership and collaborator `DashboardShare` permissions.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.dashboard import Dashboard, DashboardShare
from app.models.user import User

PermissionLevel = Literal["VIEW", "EDIT", "OWNER"]
"""Canonical literal union for dashboard RBAC permission levels."""


class PermissionLevelEnum(IntEnum):
  """
  Ordered numeric enumeration of dashboard permission levels (`VIEW < EDIT < OWNER`).
  """

  VIEW = 1
  EDIT = 2
  OWNER = 3

  @classmethod
  def from_str(cls, level: str) -> "PermissionLevelEnum":
    """
    Resolves a permission level string (`'VIEW'`, `'EDIT'`, `'OWNER'`) into its `PermissionLevelEnum` rank.

    Args:
        level (str): Permission level string.

    Returns:
        PermissionLevelEnum: Resolved enum value (defaults to `VIEW` for unrecognized strings).
    """
    normalized = level.strip().upper()
    if normalized == "OWNER":
      return cls.OWNER
    if normalized == "EDIT":
      return cls.EDIT
    return cls.VIEW


class DashboardAccessPolicy:
  """
  Evaluates ownership and collaborator `DashboardShare` permissions for dashboards.
  """

  async def get_dashboard_with_access_result(
    self,
    dashboard_id: UUID,
    current_user: User,
    db: AsyncSession,
    required_level: PermissionLevel = "VIEW",
    accept_language: str | None = None,
  ) -> AppResult[tuple[Dashboard, str]]:
    """
    Verifies that `current_user` holds `required_level` access to `dashboard_id`, returning `AppResult`.

    Args:
        dashboard_id (UUID): Target dashboard ID.
        current_user (User): Requesting user model instance.
        db (AsyncSession): Active database session.
        required_level (PermissionLevel): Minimum required permission (`VIEW`, `EDIT`, `OWNER`).
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[tuple[Dashboard, str]]: `Ok((dashboard, permission_level))` or `Err(AppError)`.
    """
    required_rank = PermissionLevelEnum.from_str(required_level)
    stmt = (
      select(Dashboard)
      .where(Dashboard.id == dashboard_id)
      .options(selectinload(Dashboard.widgets), selectinload(Dashboard.shares))
    )
    result = await db.execute(stmt)
    dashboard = result.scalars().first()
    if not dashboard:
      msg = get_translated_message(
        accept_language or current_user.language_preference, "error.dashboard_not_found", "Dashboard not found"
      )
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=msg, status_code=404))

    if dashboard.owner_id == current_user.id:
      return Ok((dashboard, "OWNER"))

    if required_rank >= PermissionLevelEnum.OWNER:
      return Err(
        AppError(
          code=ErrorCode.AUTHORIZATION_ERROR,
          message="Only the dashboard owner can perform this action.",
          status_code=403,
        )
      )

    share_stmt = select(DashboardShare).where(
      and_(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == current_user.id)
    )
    share_res = await db.execute(share_stmt)
    share = share_res.scalars().first()

    if not share:
      msg = get_translated_message(
        accept_language or current_user.language_preference, "error.dashboard_not_found", "Dashboard not found"
      )
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=msg, status_code=404))

    granted_rank = PermissionLevelEnum.from_str(share.permission_level)
    if granted_rank < required_rank:
      return Err(
        AppError(
          code=ErrorCode.AUTHORIZATION_ERROR,
          message="Edit permission required for this operation.",
          status_code=403,
        )
      )

    return Ok((dashboard, share.permission_level.upper()))


dashboard_access_policy = DashboardAccessPolicy()

__all__ = [
  "DashboardAccessPolicy",
  "PermissionLevel",
  "PermissionLevelEnum",
  "dashboard_access_policy",
]
