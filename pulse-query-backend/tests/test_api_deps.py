"""
Tests for API dependencies.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

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


@pytest.mark.asyncio
async def test_get_current_user_active_success() -> None:
  """Active user should be returned successfully."""
  db = AsyncMock()
  user_id = uuid.uuid4()
  mock_user = MagicMock()
  mock_user.id = user_id
  mock_user.is_active = True

  result = MagicMock()
  result.scalars.return_value.first.return_value = mock_user
  db.execute.return_value = result

  with patch("app.api.deps.jwt.decode", return_value={"sub": str(user_id)}):
    user = await get_current_user(token="valid-token", db=db)

  assert user == mock_user


@pytest.mark.asyncio
async def test_get_current_user_inactive_raises_400() -> None:
  """Inactive user should raise 400 Bad Request."""
  db = AsyncMock()
  user_id = uuid.uuid4()
  mock_user = MagicMock()
  mock_user.id = user_id
  mock_user.is_active = False

  result = MagicMock()
  result.scalars.return_value.first.return_value = mock_user
  db.execute.return_value = result

  with patch("app.api.deps.jwt.decode", return_value={"sub": str(user_id)}):
    with pytest.raises(HTTPException) as exc:
      await get_current_user(token="valid-token", db=db)

  assert exc.value.status_code == 400
  assert "Inactive user" in exc.value.detail


@pytest.mark.asyncio
async def test_require_role_admin_and_super_admin_bypass() -> None:
  """Admin and SUPER_ADMIN role should bypass allowed_roles restriction."""
  from app.api.deps import require_role

  checker = require_role("CHIEF_MEDICAL_OFFICER")

  admin_user = MagicMock()
  admin_user.is_admin = True
  admin_user.role = "DATA_ANALYST"
  res_admin = await checker(current_user=admin_user)
  assert res_admin == admin_user

  super_admin = MagicMock()
  super_admin.is_admin = False
  super_admin.role = "SUPER_ADMIN"
  res_super = await checker(current_user=super_admin)
  assert res_super == super_admin


@pytest.mark.asyncio
async def test_require_role_matching_role_allowed() -> None:
  """User having one of the allowed roles should be accepted."""
  from app.api.deps import require_role

  checker = require_role("CHIEF_MEDICAL_OFFICER", "DEPARTMENT_CHAIR")

  cmo_user = MagicMock()
  cmo_user.is_admin = False
  cmo_user.role = "CHIEF_MEDICAL_OFFICER"

  res = await checker(current_user=cmo_user)
  assert res == cmo_user


@pytest.mark.asyncio
async def test_require_role_insufficient_permissions_raises_403() -> None:
  """User lacking required role should raise 403 Forbidden."""
  from app.api.deps import require_role

  checker = require_role("CHIEF_MEDICAL_OFFICER")

  analyst_user = MagicMock()
  analyst_user.is_admin = False
  analyst_user.role = "DATA_ANALYST"

  with pytest.raises(HTTPException) as exc:
    await checker(current_user=analyst_user)

  assert exc.value.status_code == 403
  assert "Insufficient role permissions" in exc.value.detail
