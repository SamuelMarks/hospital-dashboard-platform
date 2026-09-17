"""
User Administration API Router.

Provides privileged operations for administrators to list hospital users,
update clinical role assignments, and suspend or activate user accounts.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import require_admin
from app.database.postgres import get_db
from app.models.user import Role, User
from app.schemas.user import UserResponse, UserRoleUpdate, UserStatusUpdate

router = APIRouter()


@router.get("", response_model=list[UserResponse])
@router.get("/", response_model=list[UserResponse])
async def list_users(
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
  limit: int = Query(default=50, ge=1, le=200),
  offset: int = Query(default=0, ge=0),
  role: str | None = Query(default=None),
  search: str | None = Query(default=None),
) -> list[User]:
  """
  Lists hospital platform users with optional role filtering and email search.

  Args:
      db (AsyncSession): PostgreSQL async database session.
      current_user (User): Requesting administrator user.
      limit (int): Pagination batch size limit (1 - 200). Defaults to 50.
      offset (int): Pagination record offset. Defaults to 0.
      role (str | None): Optional clinical role filter. Defaults to None.
      search (str | None): Optional email search substring. Defaults to None.

  Returns:
      list[User]: Filtered list of registered user profiles.
  """
  stmt = select(User).order_by(User.email)

  if role:
    stmt = stmt.where(User.role == role)
  if search:
    stmt = stmt.where(User.email.ilike(f"%{search.strip()}%"))

  stmt = stmt.limit(limit).offset(offset)
  result = await db.execute(stmt)
  return list(result.scalars().all())


@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
  user_id: UUID,
  payload: UserRoleUpdate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
) -> User:
  """
  Updates the clinical or administrative role assignment for a target user.

  Args:
      user_id (UUID): Target user identifier.
      payload (UserRoleUpdate): Desired new clinical role string.
      db (AsyncSession): PostgreSQL async database session.
      current_user (User): Requesting administrator user.

  Returns:
      User: The updated user profile entity.

  Raises:
      HTTPException: 400 if the role is invalid, 404 if the user is not found.
  """
  valid_roles = {r.value for r in Role}
  if payload.role not in valid_roles:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"Invalid clinical role '{payload.role}'. Allowed: {', '.join(sorted(valid_roles))}",
    )

  result = await db.execute(select(User).where(User.id == user_id))
  user = result.scalars().first()
  if not user:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

  user.role = payload.role
  if payload.role == Role.SUPER_ADMIN.value:
    user.is_admin = True

  await db.commit()
  await db.refresh(user)
  return user


@router.put("/{user_id}/status", response_model=UserResponse)
async def update_user_status(
  user_id: UUID,
  payload: UserStatusUpdate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(require_admin)],
) -> User:
  """
  Activates or suspends a hospital user platform account.

  Prevents administrators from suspending their own active account.

  Args:
      user_id (UUID): Target user identifier.
      payload (UserStatusUpdate): New active flag state.
      db (AsyncSession): PostgreSQL async database session.
      current_user (User): Requesting administrator user.

  Returns:
      User: The updated user profile entity.

  Raises:
      HTTPException: 400 if administrator attempts self-suspension, 404 if not found.
  """
  if user_id == current_user.id and not payload.is_active:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Administrators cannot suspend their own active account.",
    )

  result = await db.execute(select(User).where(User.id == user_id))
  user = result.scalars().first()
  if not user:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

  user.is_active = payload.is_active
  await db.commit()
  await db.refresh(user)
  return user
