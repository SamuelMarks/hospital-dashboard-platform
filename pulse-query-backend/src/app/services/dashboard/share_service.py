"""
Dashboard collaborator sharing service for granting, listing, and revoking dashboard access.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.dashboard import DashboardShare
from app.models.user import User
from app.schemas.dashboard import DashboardShareCreate, DashboardShareResponse


class DashboardShareService:
  """
  Manages collaborator share creation, listing, and revocation for dashboards.
  """

  async def share_dashboard_result(
    self,
    dashboard_id: UUID,
    share_in: DashboardShareCreate,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[DashboardShareResponse]:
    """
    Grants or updates a collaborator share on `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        share_in (DashboardShareCreate): Target user email and permission level.
        current_user (User): Authenticated dashboard owner.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[DashboardShareResponse]: `Ok(DashboardShareResponse)` or `Err(AppError)`.
    """
    user_stmt = select(User).where(User.email == share_in.user_email)
    target_user = (await db.execute(user_stmt)).scalars().first()
    if not target_user:
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message="Target user not found", status_code=404))

    if target_user.id == current_user.id:
      return Err(
        AppError(code=ErrorCode.SHARE_SELF_FORBIDDEN, message="Cannot share dashboard with yourself", status_code=400)
      )

    perm = share_in.permission_level.upper()
    if perm not in ("VIEW", "EDIT"):
      return Err(
        AppError(
          code=ErrorCode.SHARE_INVALID_PERMISSION,
          message="Permission level must be VIEW or EDIT",
          status_code=400,
        )
      )

    existing_stmt = select(DashboardShare).where(
      and_(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == target_user.id)
    )
    existing = (await db.execute(existing_stmt)).scalars().first()

    if existing:
      existing.permission_level = perm
      share = existing
    else:
      share = DashboardShare(
        dashboard_id=dashboard_id,
        user_id=target_user.id,
        permission_level=perm,
      )
      db.add(share)

    await db.commit()
    await db.refresh(share)

    return Ok(
      DashboardShareResponse(
        id=share.id,
        dashboard_id=share.dashboard_id,
        user_id=target_user.id,
        user_email=target_user.email,
        permission_level=share.permission_level,
      )
    )

  async def list_dashboard_shares(
    self,
    dashboard_id: UUID,
    db: AsyncSession,
  ) -> AppResult[list[DashboardShareResponse]]:
    """
    Lists all active shares on `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[list[DashboardShareResponse]]: `Ok(shares)` containing active collaborator shares.
    """
    stmt = (
      select(DashboardShare, User.email)
      .join(User, DashboardShare.user_id == User.id)
      .where(DashboardShare.dashboard_id == dashboard_id)
    )
    res = await db.execute(stmt)
    return Ok(
      [
        DashboardShareResponse(
          id=share.id,
          dashboard_id=share.dashboard_id,
          user_id=share.user_id,
          user_email=email,
          permission_level=share.permission_level,
        )
        for share, email in res.all()
      ]
    )

  async def delete_dashboard_share_result(
    self,
    dashboard_id: UUID,
    share_id: UUID,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Revokes a collaborator share from `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        share_id (UUID): Share record UUID to revoke.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[bool]: `Ok(True)` if deleted, or `Err(AppError)` if not found.
    """
    stmt = select(DashboardShare).where(and_(DashboardShare.id == share_id, DashboardShare.dashboard_id == dashboard_id))
    share = (await db.execute(stmt)).scalars().first()
    if not share:
      return Err(AppError(code=ErrorCode.SHARE_NOT_FOUND, message="Share not found", status_code=404))

    await db.delete(share)
    await db.commit()
    return Ok(True)


dashboard_share_service = DashboardShareService()

__all__ = [
  "DashboardShareService",
  "dashboard_share_service",
]
