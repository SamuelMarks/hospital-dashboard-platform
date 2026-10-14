"""Tests for security."""

from jose import jwt

from app.core import security
from app.core.config import settings


def test_password_hashing() -> None:
  """Verify password hashing behavior."""
  password = "secret_password"
  hashed = security.get_password_hash(password)

  assert hashed != password
  assert security.verify_password(password, hashed) is True
  assert security.verify_password("wrong_password", hashed) is False


def test_get_access_token() -> None:
  """Verify get access token behavior."""
  email = "test@example.com"
  token = security.create_access_token(subject=email)

  payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert payload["sub"] == email
  assert "exp" in payload
