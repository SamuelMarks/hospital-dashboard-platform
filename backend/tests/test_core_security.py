"""
Tests for password hashing and JWT helpers.
"""

from datetime import timedelta
from jose import jwt

from app.core.config import settings
from app.core.security import get_password_hash, verify_password, create_access_token


def test_password_hash_roundtrip() -> None:
  """Ensure hashing and verification work for valid and invalid passwords."""
  raw = "super-secret"
  hashed = get_password_hash(raw)

  assert verify_password(raw, hashed) is True
  assert verify_password("wrong-password", hashed) is False


def test_create_access_token_contains_subject() -> None:
  """Verify the JWT includes the expected subject claim."""
  token = create_access_token("user-123", expires_delta=timedelta(minutes=5))

  payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert payload["sub"] == "user-123"


def test_create_access_token_default_expiry() -> None:
  """Token creation succeeds when no explicit expiry is provided."""
  token = create_access_token("user-456")
  payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert payload["sub"] == "user-456"
