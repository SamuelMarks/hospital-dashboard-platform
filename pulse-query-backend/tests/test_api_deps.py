"""
Tests for API dependencies (`app.api.deps`) against real SQLAlchemy sessions and JWT tokens.
"""

import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
  check_user_role_result,
  get_current_user,
  get_dashboard_with_access,
  require_role,
  resolve_user_from_token_result,
)
from app.core import security
from app.core.result import Err, ErrorCode, Ok
from app.models.dashboard import Dashboard
from app.models.user import User


@pytest.mark.asyncio
async def test_get_current_user_missing_token(db_session: AsyncSession) -> None:
  """Missing both header_token and query token should raise 401."""
  with pytest.raises(HTTPException) as exc:
    await get_current_user(db=db_session, header_token=None, token=None)

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_missing_sub(db_session: AsyncSession) -> None:
  """JWT missing subject claim should return Err(AUTHENTICATION_ERROR) and raise 401."""
  from jose import jwt

  from app.core.config import settings

  token_no_sub = jwt.encode({"type": "access"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
  res = await resolve_user_from_token_result(token_no_sub, db_session)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.AUTHENTICATION_ERROR

  with pytest.raises(HTTPException) as exc:
    await get_current_user(db=db_session, token=token_no_sub)

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(db_session: AsyncSession) -> None:
  """Malformed JWT token should return Err(AUTHENTICATION_ERROR) and raise 401."""
  res = await resolve_user_from_token_result("not-a-valid-jwt", db_session)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.AUTHENTICATION_ERROR

  with pytest.raises(HTTPException) as exc:
    await get_current_user(db=db_session, token="not-a-valid-jwt")

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_not_found(db_session: AsyncSession) -> None:
  """Valid JWT for a non-existent user UUID should raise 401."""
  missing_id = uuid.uuid4()
  token = security.create_access_token(subject=missing_id)

  res = await resolve_user_from_token_result(token, db_session)
  assert isinstance(res, Err)
  assert res.error.status_code == 401

  with pytest.raises(HTTPException) as exc:
    await get_current_user(db=db_session, token=token)

  assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_active_success(db_session: AsyncSession) -> None:
  """Active user in database should be resolved and returned wrapped in Ok."""
  user = User(
    id=uuid.uuid4(),
    email=f"active_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()

  token = security.create_access_token(subject=user.id)
  res = await resolve_user_from_token_result(token, db_session)
  assert isinstance(res, Ok)
  assert res.value.id == user.id

  resolved = await get_current_user(db=db_session, header_token=token)
  assert resolved.id == user.id


@pytest.mark.asyncio
async def test_get_current_user_inactive_raises_400(db_session: AsyncSession) -> None:
  """Inactive user in database should return Err(AUTH_INACTIVE_USER) and raise 400 Bad Request."""
  inactive_user = User(
    id=uuid.uuid4(),
    email=f"inactive_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=False,
  )
  db_session.add(inactive_user)
  await db_session.commit()

  token = security.create_access_token(subject=inactive_user.id)
  res = await resolve_user_from_token_result(token, db_session)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.AUTH_INACTIVE_USER

  with pytest.raises(HTTPException) as exc:
    await get_current_user(db=db_session, token=token)

  assert exc.value.status_code == 400
  assert "Inactive user" in exc.value.detail


@pytest.mark.asyncio
async def test_require_role_admin_and_super_admin_bypass() -> None:
  """Admin and SUPER_ADMIN role should bypass allowed_roles restriction."""
  checker = require_role("CHIEF_MEDICAL_OFFICER")

  admin_user = User(
    id=uuid.uuid4(),
    email="admin_role@hospital.org",
    hashed_password="pw",
    is_active=True,
    is_admin=True,
    role="DATA_ANALYST",
  )
  res_admin = await checker(current_user=admin_user)
  assert res_admin == admin_user

  super_admin = User(
    id=uuid.uuid4(),
    email="super_admin@hospital.org",
    hashed_password="pw",
    is_active=True,
    is_admin=False,
    role="SUPER_ADMIN",
  )
  res_super = await checker(current_user=super_admin)
  assert res_super == super_admin


@pytest.mark.asyncio
async def test_require_role_matching_role_allowed() -> None:
  """User having one of the allowed roles should be accepted."""
  checker = require_role("CHIEF_MEDICAL_OFFICER", "DEPARTMENT_CHAIR")

  cmo_user = User(
    id=uuid.uuid4(),
    email="cmo@hospital.org",
    hashed_password="pw",
    is_active=True,
    is_admin=False,
    role="CHIEF_MEDICAL_OFFICER",
  )

  res = await checker(current_user=cmo_user)
  assert res == cmo_user


@pytest.mark.asyncio
async def test_require_role_insufficient_permissions_raises_403() -> None:
  """User lacking required role should return Err(AUTH_INSUFFICIENT_ROLE) and raise 403 Forbidden."""
  checker = require_role("CHIEF_MEDICAL_OFFICER")

  analyst_user = User(
    id=uuid.uuid4(),
    email="analyst@hospital.org",
    hashed_password="pw",
    is_active=True,
    is_admin=False,
    role="DATA_ANALYST",
  )

  role_res = check_user_role_result(analyst_user, ("CHIEF_MEDICAL_OFFICER",))
  assert isinstance(role_res, Err)
  assert role_res.error.code == ErrorCode.AUTH_INSUFFICIENT_ROLE

  with pytest.raises(HTTPException) as exc:
    await checker(current_user=analyst_user)

  assert exc.value.status_code == 403
  assert "Insufficient role permissions" in exc.value.detail


@pytest.mark.asyncio
async def test_get_dashboard_with_access_dependency(db_session: AsyncSession) -> None:
  """Verifies `get_dashboard_with_access` returns `(Dashboard, 'OWNER')` for owner and raises 404 for missing."""
  owner = User(
    id=uuid.uuid4(),
    email=f"dash_owner_{uuid.uuid4()}@hospital.org",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(owner)
  dash = Dashboard(id=uuid.uuid4(), name="Owner Dash", owner_id=owner.id)
  db_session.add(dash)
  await db_session.commit()

  loaded_dash, perm = await get_dashboard_with_access(dash.id, owner, db_session, required_level="OWNER")
  assert loaded_dash.id == dash.id
  assert perm == "OWNER"

  with pytest.raises(HTTPException) as exc:
    await get_dashboard_with_access(uuid.uuid4(), owner, db_session)
  assert exc.value.status_code == 404
