"""
API Dependencies Module.

This module defines reusable dependencies for FastAPI path operations.
Primarily, it handles authentication logic: extracting the bearer token,
decoding the JWT, validating the payload, and retrieving the corresponding
user from the database.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.token import TokenPayload

# 1. Define the OAuth2 Scheme
# This tells FastAPI that the client should send a token in the Authorization header
# formatted as "Bearer <token>". The 'tokenUrl' parameter points to the relative
# URL where the client can acquire a token (used by Swagger UI).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


async def get_current_user(
  token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
  """
  Dependency that resolves the current authenticated user from a JWT token.

  This function performs the following steps:
  1. Decodes the JWT token using the secret key.
  2. Validates the token payload (subject / user ID).
  3. Queries the database to find the user associated with that ID.
  4. Returns the User model instance if valid, or raises an HTTPException.

  Args:
      token (str): The OAuth2 access token extracted from the request header.
      db (AsyncSession): The database session dependency.

  Returns:
      User: The SQLAlchemy model instance of the authenticated user.

  Raises:
      HTTPException:
          - 401 Unauthorized: If the token is invalid, expired, or the user
            cannot be found.
          - 403 Forbidden: If the user account is inactive (optional logic).
  """
  credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
  )

  try:
    # A. Decode the JWT
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

    # B. Extract Subject (User ID)
    user_id_str: str | None = payload.get("sub")
    if user_id_str is None:
      raise credentials_exception

    # C. Validate Payload Structure via Pydantic
    token_data = TokenPayload(sub=UUID(user_id_str))

  except (JWTError, ValidationError):
    # Catch decoding errors or malformed payloads
    raise credentials_exception

  # D. Fetch User from Database
  result = await db.execute(select(User).where(User.id == token_data.sub))
  user = result.scalars().first()

  if user is None:
    raise credentials_exception

  return user
