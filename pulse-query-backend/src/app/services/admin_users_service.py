"""
Admin Users Domain Service Module.

Encapsulates user directory listing, clinical role updates, and account
activation/suspension using explicit `AppResult[T]` return values.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.user import Role, User
from app.schemas.user import UserRoleUpdate, UserStatusUpdate


class AdminUsersService:
  """
  Domain service for privileged user management operations.
  """

  async def list_users_result(
    self,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    role: str | None = None,
    search: str | None = None,
  ) -> AppResult[list[User]]:
    """
    Lists platform users with optional role filtering and email substring search.

    Args:
        db (AsyncSession): Active PostgreSQL async session.
        limit (int): Pagination batch size limit.
        offset (int): Pagination record offset.
        role (str | None): Optional clinical role filter.
        search (str | None): Optional case-insensitive email search term.

    Returns:
        AppResult[list[User]]: `Ok(list[User])` containing matching users.
    """
    stmt = select(User).order_by(User.email)

    if role:
      stmt = stmt.where(User.role == role)
    if search:
      stmt = stmt.where(User.email.ilike(f"%{search.strip()}%"))

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return Ok(list(result.scalars().all()))

  async def update_user_role_result(
    self,
    user_id: UUID,
    payload: UserRoleUpdate,
    db: AsyncSession,
  ) -> AppResult[User]:
    """
    Updates the clinical or administrative role assignment for a target user.

    Args:
        user_id (UUID): Target user UUID.
        payload (UserRoleUpdate): Desired clinical role update payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[User]: `Ok(User)` on success, or `Err(AppError)` with `ADMIN_INVALID_ROLE` / `RESOURCE_NOT_FOUND`.
    """
    valid_roles = {r.value for r in Role}
    if payload.role not in valid_roles:
      return Err(
        AppError(
          code=ErrorCode.ADMIN_INVALID_ROLE,
          message=f"Invalid clinical role '{payload.role}'. Allowed: {', '.join(sorted(valid_roles))}",
          status_code=400,
        )
      )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message="User not found",
          status_code=404,
        )
      )

    user.role = payload.role
    if payload.role == Role.SUPER_ADMIN.value:
      user.is_admin = True

    await db.commit()
    await db.refresh(user)
    return Ok(user)

  async def update_user_status_result(
    self,
    user_id: UUID,
    payload: UserStatusUpdate,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[User]:
    """
    Activates or suspends a hospital user account while preventing self-suspension.

    Args:
        user_id (UUID): Target user UUID.
        payload (UserStatusUpdate): Desired active status flag.
        current_user (User): Requesting administrator user.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[User]: `Ok(User)` on success, or `Err(AppError)` on self-suspension or missing user.
    """
    if user_id == current_user.id and not payload.is_active:
      return Err(
        AppError(
          code=ErrorCode.ADMIN_SELF_MODIFICATION_FORBIDDEN,
          message="Administrators cannot suspend their own active account.",
          status_code=400,
        )
      )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message="User not found",
          status_code=404,
        )
      )

    user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)
    return Ok(user)


admin_users_service = AdminUsersService()
