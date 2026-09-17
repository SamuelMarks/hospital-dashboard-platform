"""
Security utilities for password hashing and JWT creation.

Centralizes auth-related helpers used by API routers and dependencies.
"""

import uuid
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Optional, Union

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Setup password context (Argon2 is robust)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
  """Verifies a plain password against the stored hash."""
  return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
  """Hashes a password for storage."""
  return pwd_context.hash(password)


def create_access_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
  """
  Creates a JWT access token.
  'sub' is a standard claim for the subject (usually user ID or email).

  Args:
      subject (str | Any): Target subject identifier.
      expires_delta (timedelta | None): Custom expiration duration.

  Returns:
      str: Encoded JWT access token string.
  """
  if expires_delta:
    expire = datetime.now(UTC) + expires_delta
  else:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

  to_encode = {"exp": expire, "sub": str(subject), "jti": str(uuid.uuid4())}
  encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
  return encoded_jwt


def create_refresh_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
  """
  Creates a JWT refresh token with extended validity for session rotation.

  Args:
      subject (str | Any): Target subject identifier (user ID).
      expires_delta (timedelta | None): Custom expiration duration. Defaults to 7 days.

  Returns:
      str: Encoded JWT refresh token string.
  """
  if expires_delta:
    expire = datetime.now(UTC) + expires_delta
  else:
    expire = datetime.now(UTC) + timedelta(days=7)

  to_encode = {"exp": expire, "sub": str(subject), "type": "refresh", "jti": str(uuid.uuid4())}
  return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_password_reset_token(email: str) -> str:
  """
  Creates a time-bound JWT token specifically for password reset verification.

  Args:
      email (str): Requesting user's email address.

  Returns:
      str: Encoded JWT password reset token valid for 15 minutes.
  """
  expire = datetime.now(UTC) + timedelta(minutes=15)
  to_encode = {"exp": expire, "sub": email, "type": "reset"}
  return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_password_reset_token(token: str) -> str | None:
  """
  Decodes and validates a password reset JWT token.

  Args:
      token (str): The reset token provided by the user.

  Returns:
      str | None: The user email if token is valid and of type 'reset', otherwise None.
  """
  try:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("type") != "reset":
      return None
    sub = payload.get("sub")
    return str(sub) if sub is not None else None
  except Exception:
    return None
