"""
Tests for API dependencies.
"""

import uuid
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from fastapi import HTTPException
from jose import JWTError

from app.api.deps import get_current_user


@pytest.mark.asyncio
async def test_get_current_user_missing_sub() -> None:
  """Missing subject should raise 401."""
  db = AsyncMock()

  with patch("app.api.deps.jwt.decode", return_value={}):
    with pytest.raises(HTTPException) as exc:
      await get_current_user(token="t", db=db)

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_invalid_token() -> None:
  """JWT errors should raise 401."""
  db = AsyncMock()

  with patch("app.api.deps.jwt.decode", side_effect=JWTError("bad token")):
    with pytest.raises(HTTPException) as exc:
      await get_current_user(token="t", db=db)

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_not_found() -> None:
  """Valid token but missing user should raise 401."""
  db = AsyncMock()
  user_id = uuid.uuid4()
  result = MagicMock()
  result.scalars.return_value.first.return_value = None
  db.execute.return_value = result

  with patch("app.api.deps.jwt.decode", return_value={"sub": str(user_id)}):
    with pytest.raises(HTTPException) as exc:
      await get_current_user(token="t", db=db)

  assert exc.value.status_code == 401
