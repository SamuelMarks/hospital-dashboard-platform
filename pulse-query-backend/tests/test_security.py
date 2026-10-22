"""Tests for security."""

from jose import jwt

from app.core import security
from app.core.config import settings


def test_password_hashing() -> None:
  """Verifies `get_password_hash` and `verify_password` accept valid passwords and reject mismatches."""
  password = "secret_password"
  hashed = security.get_password_hash(password)

  assert hashed != password
  assert security.verify_password(password, hashed) is True
  assert security.verify_password("wrong_password", hashed) is False


def test_get_access_token() -> None:
  """Verifies `create_access_token` encodes the `sub` and `exp` claims using `SECRET_KEY`."""
  email = "test@example.com"
  token = security.create_access_token(subject=email)

  payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert payload["sub"] == email
  assert "exp" in payload
