"""
User Administration API Router.

Provides privileged operations for administrators to list hospital users,
update clinical role assignments, and suspend or activate user accounts
by delegating to `AdminUsersService`.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import require_admin
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserRoleUpdate, UserStatusUpdate
from app.services.admin_users_service import admin_users_service

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
  _ = current_user
  res = await admin_users_service.list_users_result(
    db=db,
    limit=limit,
    offset=offset,
    role=role,
    search=search,
  )
  return unwrap_or_raise_http(res)


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
  _ = current_user
  res = await admin_users_service.update_user_role_result(user_id=user_id, payload=payload, db=db)
  return unwrap_or_raise_http(res)


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
  res = await admin_users_service.update_user_status_result(
    user_id=user_id,
    payload=payload,
    current_user=current_user,
    db=db,
  )
  return unwrap_or_raise_http(res)
