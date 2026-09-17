"""
API Dependencies Module.

This module defines reusable dependencies for FastAPI path operations.
Primarily, it handles authentication logic: extracting the bearer token,
decoding the JWT, validating the payload, and retrieving the corresponding
user from the database.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.token import TokenPayload

# 1. Define the OAuth2 Schemes
# OAuth2 scheme with auto_error=False allowing fallback to URL query token for downloads
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)
oauth2_scheme_optional = oauth2_scheme


async def _resolve_user_from_token(token: str, db: AsyncSession) -> User:
  """
  Validates a JWT token string, verifies active status, and resolves the User record.

  Args:
      token (str): Raw JWT token string.
      db (AsyncSession): Active asynchronous database session.

  Returns:
      User: Verified SQLAlchemy User model instance.

  Raises:
      HTTPException: 401 Unauthorized on invalid/expired token, 400 on inactive user.
  """
  credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
  )

  try:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    user_id_str: str | None = payload.get("sub")
    if user_id_str is None:
      raise credentials_exception

    token_data = TokenPayload(sub=UUID(user_id_str))
  except (JWTError, ValidationError):
    raise credentials_exception

  result = await db.execute(select(User).where(User.id == token_data.sub))
  user = result.scalars().first()

  if user is None:
    raise credentials_exception

  if not user.is_active:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

  return user


async def get_current_user(
  db: Annotated[AsyncSession, Depends(get_db)],
  header_token: Annotated[str | None, Depends(oauth2_scheme)] = None,
  token: Annotated[str | None, Query(description="JWT token query parameter for direct browser downloads")] = None,
) -> User:
  """
  Dependency that resolves the current authenticated user from a JWT token.

  Accepts either Authorization Bearer header or a URL query token to support browser downloads.

  Args:
      db (AsyncSession): The database session dependency.
      header_token (str | None): The OAuth2 access token extracted from the request header.
      token (str | None): Optional JWT token supplied via URL query string.

  Returns:
      User: The SQLAlchemy model instance of the authenticated user.

  Raises:
      HTTPException: 401 Unauthorized if token invalid/expired, 400 if user inactive.
  """
  active_token = header_token or token
  if not active_token:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Could not validate credentials",
      headers={"WWW-Authenticate": "Bearer"},
    )
  return await _resolve_user_from_token(active_token, db)


# Alias for backwards compatibility
get_current_user_from_header_or_query = get_current_user


def require_role(*allowed_roles: str):
  """
  Factory returning a dependency that enforces granular hospital RBAC roles.

  Super administrators bypass role restrictions.

  Args:
      *allowed_roles (str): Role names permitted to access the path operation.

  Returns:
      Callable: Async dependency function accepting current_user and returning User.
  """

  async def role_checker(
    current_user: Annotated[User, Depends(get_current_user)],
  ) -> User:
    """
    Validates that the current user has one of the allowed roles or is super admin.

    Args:
        current_user (User): Authenticated user.

    Returns:
        User: Verified user instance.

    Raises:
        HTTPException: 403 Forbidden if user lacks required role.
    """
    if current_user.is_admin or current_user.role == "SUPER_ADMIN":
      return current_user

    if current_user.role not in allowed_roles:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient role permissions for this hospital operation",
      )
    return current_user

  return role_checker
