"""
Tests for password hashing and JWT helpers.
"""

from datetime import timedelta

from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password


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


def test_create_refresh_token_helpers() -> None:
  """Verify refresh token creation with custom and default expiry."""
  from app.core.security import create_refresh_token

  token_with_delta = create_refresh_token("user-789", expires_delta=timedelta(days=2))
  p1 = jwt.decode(token_with_delta, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert p1["sub"] == "user-789"
  assert p1["type"] == "refresh"

  token_default = create_refresh_token("user-789")
  p2 = jwt.decode(token_default, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert p2["sub"] == "user-789"
  assert p2["type"] == "refresh"


def test_password_reset_token_helpers() -> None:
  """Verify reset token creation and verification branches."""
  from app.core.security import create_access_token, create_password_reset_token, verify_password_reset_token

  # Valid reset token
  reset_tok = create_password_reset_token("reset@hospital.org")
  assert verify_password_reset_token(reset_tok) == "reset@hospital.org"

  # Access token (wrong type)
  access_tok = create_access_token("reset@hospital.org")
  assert verify_password_reset_token(access_tok) is None

  # Invalid/corrupted token
  assert verify_password_reset_token("invalid-garbage-token") is None
