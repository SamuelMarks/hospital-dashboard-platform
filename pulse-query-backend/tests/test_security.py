"""
Tests for Token Hashing, JTI Uniqueness, and Cryptographic Invariants in `app.core.security`.
"""

import hashlib
from uuid import uuid4

from jose import jwt

from app.core import security
from app.core.config import settings


def test_hash_token_jti_deterministic_sha256() -> None:
  """Verifies `hash_token_jti` returns the exact SHA-256 hex digest of the JTI string."""
  raw_jti = "test-jti-12345"
  expected = hashlib.sha256(raw_jti.encode("utf-8")).hexdigest()
  assert security.hash_token_jti(raw_jti) == expected
  assert security.hash_token_jti(raw_jti) != security.hash_token_jti("test-jti-67890")


def test_refresh_token_unique_jti_per_invocation() -> None:
  """Verifies `create_refresh_token` embeds a unique `jti` claim on each invocation."""
  uid = uuid4()
  tok1 = security.create_refresh_token(subject=uid)
  tok2 = security.create_refresh_token(subject=uid)

  assert tok1 != tok2

  p1 = jwt.decode(tok1, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  p2 = jwt.decode(tok2, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  assert p1["jti"] != p2["jti"]
  assert p1["sub"] == str(uid)
  assert p1["type"] == "refresh"
