"""
Authentication API Router.

Handles user registration, login, and profile management.
Updated to include automatic provisioning of default dashboards upon registration.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.i18n import get_translated_message
from app.database.postgres import get_db
from app.models.token import RefreshToken
from app.models.user import User

logger = logging.getLogger(__name__)
from app.schemas.token import (
  ForgotPasswordRequest,
  PasswordResetResponse,
  RefreshTokenRequest,
  ResetPasswordRequest,
  Token,
)
from app.schemas.user import UserCreate, UserResponse
from app.services.provisioning import provisioning_service  # New Dependency

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register_user(
  user_in: UserCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> User:
  """
  Register a new user in the system.

  Steps:
  1. Verify email uniqueness.
  2. Create User record.
  3. Flush session (to generate User ID).
  4. Call Provisioning Service to create default dashboard/widgets.
  5. Commit transaction.

  Args:
      user_in (UserCreate): The payload containing email and password.
      db (AsyncSession): Database session.

  Returns:
      User: The newly created user object.

  Raises:
      HTTPException: If email already exists.
  """
  # 1. Check if user exists
  result = await db.execute(select(User).where(User.email == user_in.email))
  existing_user = result.scalars().first()
  if existing_user:
    msg = get_translated_message(
      accept_language or user_in.language_preference,
      "error.user_exists",
      "The user with this email already exists in the system.",
    )
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=msg,
    )

  # 2. Create User
  user = User(
    email=user_in.email,
    hashed_password=security.get_password_hash(user_in.password),
    is_active=True,
    language_preference=user_in.language_preference,
  )
  db.add(user)

  # 3. Flush to generate the UUID for the user so we can link the dashboard
  await db.flush()

  # 4. Provision Default Assets (The 30 Questions Dashboard)
  await provisioning_service.provision_new_user(db, user)

  # 5. Commit everything atomically
  await db.commit()
  return user


@router.post("/login", response_model=Token)
async def login_access_token(
  form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Token:
  """
  OAuth2 compatible token login, get an access token for future requests.

  Args:
      form_data (OAuth2PasswordRequestForm): Login credentials (username=email).
      db (AsyncSession): Database session.

  Returns:
      Token: Access token and type.
  """
  # 1. Authenticate
  result = await db.execute(select(User).where(User.email == form_data.username))
  user = result.scalars().first()

  if not user or not security.verify_password(form_data.password, user.hashed_password):
    msg = get_translated_message(accept_language, "error.invalid_credentials", "Incorrect email or password")
    if user and user.language_preference:
      msg = get_translated_message(user.language_preference, "error.invalid_credentials", "Incorrect email or password")
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

  if not user.is_active:
    msg = get_translated_message(accept_language, "error.inactive_user", "Inactive user")
    if user and user.language_preference:
      msg = get_translated_message(user.language_preference, "error.inactive_user", "Inactive user")
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

  # 2. Generate Tokens
  access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
  access_token = security.create_access_token(subject=user.id, expires_delta=access_token_expires)
  refresh_token = security.create_refresh_token(subject=user.id)
  refresh_payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  jti = refresh_payload.get("jti", "")

  token_record = RefreshToken(
    user_id=user.id,
    token_hash=jti,
    expires_at=datetime.now(UTC) + timedelta(days=7),
  )
  db.add(token_record)
  await db.commit()

  return Token(
    access_token=access_token,
    token_type="bearer",
    refresh_token=refresh_token,
    expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
  )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
  payload: RefreshTokenRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Token:
  """
  Rotates refresh token and issues a new access and refresh token pair.

  Args:
      payload (RefreshTokenRequest): Active refresh token.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      Token: New rotated access and refresh tokens.

  Raises:
      HTTPException: 401 if refresh token is invalid, expired, or revoked.
  """
  try:
    decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if decoded.get("type") != "refresh":
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user_id_str = decoded.get("sub")
    jti = decoded.get("jti")
    if not user_id_str or not jti:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user_id = UUID(user_id_str)
  except HTTPException:
    raise
  except Exception:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate refresh token")

  result = await db.execute(
    select(RefreshToken).where(
      RefreshToken.user_id == user_id,
      RefreshToken.token_hash == jti,
      RefreshToken.expires_at > datetime.now(UTC),
    )
  )
  token_record = result.scalars().first()
  if not token_record or token_record.is_revoked:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or expired")

  # Revoke current token
  token_record.is_revoked = True

  # Issue new pair
  access_token = security.create_access_token(
    subject=user_id, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
  )
  new_refresh_token = security.create_refresh_token(subject=user_id)
  new_payload = jwt.decode(new_refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
  new_jti = new_payload.get("jti", "")

  new_record = RefreshToken(
    user_id=user_id,
    token_hash=new_jti,
    expires_at=datetime.now(UTC) + timedelta(days=7),
  )
  db.add(new_record)
  await db.commit()

  return Token(
    access_token=access_token,
    token_type="bearer",
    refresh_token=new_refresh_token,
    expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
  )


@router.post("/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
  payload: RefreshTokenRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
  """
  Revokes an active refresh token session.

  Args:
      payload (RefreshTokenRequest): Refresh token to revoke.
      db (AsyncSession): PostgreSQL async database session.
  """
  try:
    decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    user_id_str = decoded.get("sub")
    jti = decoded.get("jti")
    if user_id_str and jti:
      user_id = UUID(user_id_str)
      result = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.token_hash == jti)
      )
      token_record = result.scalars().first()
      if token_record:
        token_record.is_revoked = True
        await db.commit()
  except Exception:
    pass


from app.services.email import EmailNotificationService, get_email_service


@router.post("/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(
  payload: ForgotPasswordRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  email_service: Annotated[EmailNotificationService, Depends(get_email_service)],
) -> PasswordResetResponse:
  """
  Generates a secure password reset token and dispatches reset instructions.

  Args:
      payload (ForgotPasswordRequest): Email address of requesting user.
      db (AsyncSession): PostgreSQL async database session.
      email_service (EmailNotificationService): Transactional email service dependency.

  Returns:
      PasswordResetResponse: Confirmation message (reset token omitted from response).
  """
  result = await db.execute(select(User).where(User.email == payload.email))
  user = result.scalars().first()
  if user:
    reset_token = security.create_password_reset_token(email=user.email)
    try:
      await email_service.send_password_reset_email(recipient=user.email, reset_token=reset_token)
    except Exception as e:
      logger.error(f"Failed to dispatch password reset email: {e}")

  return PasswordResetResponse(
    message="If the email exists, a password reset token has been dispatched.",
    reset_token=None,
  )


@router.post("/reset-password", response_model=PasswordResetResponse)
async def reset_password(
  payload: ResetPasswordRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
) -> PasswordResetResponse:
  """
  Resets user account password and revokes existing sessions.

  Args:
      payload (ResetPasswordRequest): Reset token and new password.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      PasswordResetResponse: Success confirmation message.

  Raises:
      HTTPException: 400 if reset token is invalid or expired.
      HTTPException: 404 if the user cannot be located.
  """
  email = security.verify_password_reset_token(payload.token)
  if not email:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

  result = await db.execute(select(User).where(User.email == email))
  user = result.scalars().first()
  if not user:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

  user.hashed_password = security.get_password_hash(payload.new_password)

  # Revoke all active refresh tokens
  token_res = await db.execute(
    select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.is_revoked.is_(False))
  )
  for token_rec in token_res.scalars().all():
    token_rec.is_revoked = True

  await db.commit()
  return PasswordResetResponse(message="Password reset successful.")


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(deps.get_current_user)]) -> User:
  """
  Fetch the current logged in user profile.
  """
  return current_user
