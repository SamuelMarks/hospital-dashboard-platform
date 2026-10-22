"""
Security utilities for password hashing, token hashing, and JWT creation.

Centralizes auth-related helpers used by API routers and dependencies.
"""

from datetime import UTC, datetime, timedelta
import hashlib
import uuid

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Setup password context (Argon2 is robust)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
  """
  Verifies a plain password against the stored hash.

  Args:
      plain_password (str): Plaintext candidate password.
      hashed_password (str): Stored password hash.

  Returns:
      bool: True if the password matches the hash, False otherwise.
  """
  return bool(pwd_context.verify(plain_password, hashed_password))


def get_password_hash(password: str) -> str:
  """
  Hashes a password for storage using Argon2/bcrypt.

  Args:
      password (str): Plaintext password string.

  Returns:
      str: Cryptographic password hash string.
  """
  return str(pwd_context.hash(password))


def hash_token_jti(jti: str) -> str:
  """
  Computes a deterministic SHA-256 hex digest of a JWT `jti` claim for persistent storage.

  Args:
      jti (str): Raw JWT identifier (`jti` claim).

  Returns:
      str: 64-character lowercase hexadecimal SHA-256 hash.
  """
  return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def create_access_token(subject: str | uuid.UUID, expires_delta: timedelta | None = None) -> str:
  """
  Creates a JWT access token.
  'sub' is a standard claim for the subject (usually user ID or email).

  Args:
      subject (str | uuid.UUID): Target subject identifier.
      expires_delta (timedelta | None): Custom expiration duration.

  Returns:
      str: Encoded JWT access token string.
  """
  if expires_delta:
    expire = datetime.now(UTC) + expires_delta
  else:
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

  to_encode = {"exp": expire, "sub": str(subject), "jti": str(uuid.uuid4())}
  return str(jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM))


def create_refresh_token(subject: str | uuid.UUID, expires_delta: timedelta | None = None) -> str:
  """
  Creates a JWT refresh token with extended validity for session rotation.

  Args:
      subject (str | uuid.UUID): Target subject identifier (user ID).
      expires_delta (timedelta | None): Custom expiration duration. Defaults to 7 days.

  Returns:
      str: Encoded JWT refresh token string.
  """
  expire = datetime.now(UTC) + expires_delta if expires_delta else datetime.now(UTC) + timedelta(days=7)

  to_encode = {"exp": expire, "sub": str(subject), "type": "refresh", "jti": str(uuid.uuid4())}
  return str(jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM))


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
  return str(jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM))


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
