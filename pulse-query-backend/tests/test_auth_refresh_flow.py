"""
Tests for Token Refresh Rotation and Session Lifecycle API.

Verifies refresh token issuance, rotation, replay detection, session revocation,
and secure password reset flows.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.core import security


@pytest.mark.asyncio
async def test_auth_refresh_token_lifecycle(client: AsyncClient, db_session) -> None:
  """Test login issuing refresh token, token rotation, and replay rejection."""
  # 1. Register and login
  email = f"refresh_{uuid.uuid4().hex[:8]}@hospital.org"
  password = "SecurePassword123!"

  reg_res = await client.post(
    "/api/v1/auth/register",
    json={"email": email, "password": password, "language_preference": "en"},
  )
  assert reg_res.status_code == 200

  login_res = await client.post(
    "/api/v1/auth/login",
    data={"username": email, "password": password},
  )
  assert login_res.status_code == 200
  token_data = login_res.json()
  assert "access_token" in token_data
  assert "refresh_token" in token_data
  original_refresh = token_data["refresh_token"]

  # 2. Refresh token rotation
  refresh_res = await client.post(
    "/api/v1/auth/refresh",
    json={"refresh_token": original_refresh},
  )
  assert refresh_res.status_code == 200
  new_token_data = refresh_res.json()
  assert new_token_data["access_token"] != token_data["access_token"]
  assert new_token_data["refresh_token"] != original_refresh
  second_refresh = new_token_data["refresh_token"]

  # 3. Replay attack attempt with original_refresh should be rejected (401)
  replay_res = await client.post(
    "/api/v1/auth/refresh",
    json={"refresh_token": original_refresh},
  )
  assert replay_res.status_code == 401
  assert "revoked or expired" in replay_res.json()["detail"].lower()

  # 4. Revoke active session
  revoke_res = await client.post(
    "/api/v1/auth/revoke",
    json={"refresh_token": second_refresh},
  )
  assert revoke_res.status_code == 204

  # 5. Revoked token can no longer be used
  revoked_refresh = await client.post(
    "/api/v1/auth/refresh",
    json={"refresh_token": second_refresh},
  )
  assert revoked_refresh.status_code == 401


@pytest.mark.asyncio
async def test_auth_refresh_invalid_tokens(client: AsyncClient) -> None:
  """Test refresh endpoint rejection of malformed tokens and access tokens."""
  # Case 1: Malformed string
  res_bad = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-token"})
  assert res_bad.status_code == 401

  # Case 2: Using an access token (wrong type claim)
  access_token = security.create_access_token(subject=str(uuid.uuid4()))
  res_wrong_type = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
  assert res_wrong_type.status_code == 401
  assert "invalid token type" in res_wrong_type.json()["detail"].lower()

  # Case 3: Token missing 'sub' or 'jti'
  from jose import jwt
  from app.core.config import settings

  token_no_sub = jwt.encode({"type": "refresh", "jti": "j1"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
  res_no_sub = await client.post("/api/v1/auth/refresh", json={"refresh_token": token_no_sub})
  assert res_no_sub.status_code == 401
  assert "invalid token payload" in res_no_sub.json()["detail"].lower()


@pytest.mark.asyncio
async def test_auth_revoke_edge_cases(client: AsyncClient) -> None:
  """Test revoke endpoint handles bad tokens and non-existent payloads gracefully."""
  # Case 1: Corrupted token is swallowed safely
  res_corrupt = await client.post("/api/v1/auth/revoke", json={"refresh_token": "corrupt-token"})
  assert res_corrupt.status_code == 204

  # Case 2: Token missing jti is swallowed safely
  from jose import jwt
  from app.core.config import settings

  token_no_jti = jwt.encode(
    {"type": "refresh", "sub": str(uuid.uuid4())}, settings.SECRET_KEY, algorithm=settings.ALGORITHM
  )
  res_no_jti = await client.post("/api/v1/auth/revoke", json={"refresh_token": token_no_jti})
  assert res_no_jti.status_code == 204

  # Case 3: Valid token format but no matching database record
  untracked_refresh = security.create_refresh_token(subject=str(uuid.uuid4()))
  res_untracked = await client.post("/api/v1/auth/revoke", json={"refresh_token": untracked_refresh})
  assert res_untracked.status_code == 204


@pytest.mark.asyncio
async def test_password_reset_flow(client: AsyncClient, db_session) -> None:
  """Test forgot password token generation and password reset execution."""
  email = f"reset_{uuid.uuid4().hex[:8]}@hospital.org"
  password = "InitialPassword123!"
  new_password = "UpdatedPassword456!"

  # Register user and log in to establish active refresh token
  await client.post(
    "/api/v1/auth/register",
    json={"email": email, "password": password, "language_preference": "en"},
  )
  await client.post(
    "/api/v1/auth/login",
    data={"username": email, "password": password},
  )

  # Request reset for registered email
  from app.services.email import _mock_email_service

  forgot_res = await client.post(
    "/api/v1/auth/forgot-password",
    json={"email": email},
  )
  assert forgot_res.status_code == 200
  assert forgot_res.json()["reset_token"] is None
  reset_token = _mock_email_service.last_token
  assert reset_token is not None

  # Request reset for non-existent email (timing-safe generic response)
  forgot_non_existent = await client.post(
    "/api/v1/auth/forgot-password",
    json={"email": "nonexistent@hospital.org"},
  )
  assert forgot_non_existent.status_code == 200
  assert forgot_non_existent.json()["reset_token"] is None

  # Reset with invalid token returns 400
  bad_reset = await client.post(
    "/api/v1/auth/reset-password",
    json={"token": "invalid-token", "new_password": new_password},
  )
  assert bad_reset.status_code == 400

  # Reset with valid token succeeds
  good_reset = await client.post(
    "/api/v1/auth/reset-password",
    json={"token": reset_token, "new_password": new_password},
  )
  assert good_reset.status_code == 200
  assert "successful" in good_reset.json()["message"].lower()

  # Verify login with new password succeeds and old password fails
  fail_login = await client.post(
    "/api/v1/auth/login",
    data={"username": email, "password": password},
  )
  assert fail_login.status_code == 400

  success_login = await client.post(
    "/api/v1/auth/login",
    data={"username": email, "password": new_password},
  )
  assert success_login.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_user_not_found(client: AsyncClient) -> None:
  """Reset password token valid but user removed returns 404."""
  token = security.create_password_reset_token(email="deleted@hospital.org")
  res = await client.post(
    "/api/v1/auth/reset-password",
    json={"token": token, "new_password": "NewPassword123!"},
  )
  assert res.status_code == 404
