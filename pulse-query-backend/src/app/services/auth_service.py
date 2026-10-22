"""
Authentication Domain Service Module.

Encapsulates user registration, OAuth2 password authentication, JWT refresh
token rotation, session revocation, and password reset workflows using
explicit `AppResult[T]` return values instead of untyped exception control flow.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
from uuid import UUID

from fastapi import status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.token import RefreshToken
from app.models.user import User
from app.schemas.token import (
  ForgotPasswordRequest,
  PasswordResetResponse,
  RefreshTokenRequest,
  ResetPasswordRequest,
  Token,
)
from app.schemas.user import UserCreate
from app.services.email import EmailNotificationService
from app.services.provisioning import provisioning_service

logger = logging.getLogger(__name__)


class AuthService:
  """
  Domain service handling user authentication, registration, and session lifecycle.
  """

  async def register_user_result(
    self,
    user_in: UserCreate,
    db: AsyncSession,
    accept_language: str | None = None,
  ) -> AppResult[User]:
    """
    Registers a new user and provisions their default hospital dashboard.

    Args:
        user_in (UserCreate): Registration payload containing email and password.
        db (AsyncSession): Active PostgreSQL async session.
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[User]: `Ok(User)` on success, or `Err(AppError)` with `AUTH_USER_EXISTS` on duplicate email.
    """
    result = await db.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalars().first()
    if existing_user:
      msg = get_translated_message(
        accept_language or user_in.language_preference,
        "error.user_exists",
        "The user with this email already exists in the system.",
      )
      return Err(
        AppError(
          code=ErrorCode.AUTH_USER_EXISTS,
          message=msg,
          status_code=status.HTTP_400_BAD_REQUEST,
        )
      )

    user = User(
      email=user_in.email,
      hashed_password=security.get_password_hash(user_in.password),
      is_active=True,
      language_preference=user_in.language_preference,
    )
    db.add(user)
    await db.flush()

    await provisioning_service.provision_new_user(db, user)
    await db.commit()
    return Ok(user)

  async def login_access_token_result(
    self,
    username: str,
    password: str,
    db: AsyncSession,
    accept_language: str | None = None,
  ) -> AppResult[Token]:
    """
    Authenticates user credentials and issues an access and refresh token pair.

    Args:
        username (str): User email address.
        password (str): Plain-text password to verify.
        db (AsyncSession): Active PostgreSQL async session.
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[Token]: `Ok(Token)` on valid active credentials, or `Err(AppError)`.
    """
    result = await db.execute(select(User).where(User.email == username))
    user = result.scalars().first()

    if not user or not security.verify_password(password, user.hashed_password):
      locale = user.language_preference if (user and user.language_preference) else accept_language
      msg = get_translated_message(locale, "error.invalid_credentials", "Incorrect email or password")
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_CREDENTIALS,
          message=msg,
          status_code=status.HTTP_400_BAD_REQUEST,
        )
      )

    if not user.is_active:
      locale = user.language_preference if user.language_preference else accept_language
      msg = get_translated_message(locale, "error.inactive_user", "Inactive user")
      return Err(
        AppError(
          code=ErrorCode.AUTH_INACTIVE_USER,
          message=msg,
          status_code=status.HTTP_400_BAD_REQUEST,
        )
      )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(subject=user.id, expires_delta=access_token_expires)
    refresh_token = security.create_refresh_token(subject=user.id)
    refresh_payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    jti = str(refresh_payload.get("jti", ""))

    token_record = RefreshToken(
      user_id=user.id,
      token_hash=security.hash_token_jti(jti),
      expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(token_record)
    await db.commit()

    return Ok(
      Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
      )
    )

  async def refresh_access_token_result(
    self,
    payload: RefreshTokenRequest,
    db: AsyncSession,
  ) -> AppResult[Token]:
    """
    Rotates an active refresh token and issues a new access and refresh token pair.

    Args:
        payload (RefreshTokenRequest): Refresh token request payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[Token]: `Ok(Token)` on valid rotation, or `Err(AppError)` with 401 status.
    """
    try:
      decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Could not validate refresh token",
          status_code=status.HTTP_401_UNAUTHORIZED,
        )
      )

    if decoded.get("type") != "refresh":
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Invalid token type",
          status_code=status.HTTP_401_UNAUTHORIZED,
        )
      )

    user_id_str = decoded.get("sub")
    jti = decoded.get("jti")
    if not user_id_str or not jti:
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Invalid token payload",
          status_code=status.HTTP_401_UNAUTHORIZED,
        )
      )

    try:
      user_id = UUID(str(user_id_str))
    except ValueError:
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Could not validate refresh token",
          status_code=status.HTTP_401_UNAUTHORIZED,
        )
      )

    jti_str = str(jti)
    hashed_jti = security.hash_token_jti(jti_str)
    result = await db.execute(
      select(RefreshToken).where(
        RefreshToken.user_id == user_id,
        RefreshToken.token_hash.in_([hashed_jti, jti_str]),
        RefreshToken.expires_at > datetime.now(UTC),
      )
    )
    token_record = result.scalars().first()
    if not token_record or token_record.is_revoked:
      return Err(
        AppError(
          code=ErrorCode.AUTH_TOKEN_REVOKED,
          message="Refresh token revoked or expired",
          status_code=status.HTTP_401_UNAUTHORIZED,
        )
      )

    token_record.is_revoked = True

    access_token = security.create_access_token(
      subject=user_id, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    new_refresh_token = security.create_refresh_token(subject=user_id)
    new_payload = jwt.decode(new_refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    new_jti = str(new_payload.get("jti", ""))

    new_record = RefreshToken(
      user_id=user_id,
      token_hash=security.hash_token_jti(new_jti),
      expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(new_record)
    await db.commit()

    return Ok(
      Token(
        access_token=access_token,
        token_type="bearer",
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
      )
    )

  async def revoke_session_result(
    self,
    payload: RefreshTokenRequest,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Revokes an active refresh token session if the token is valid and found.

    Args:
        payload (RefreshTokenRequest): Refresh token request payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[bool]: `Ok(True)` if revoked, `Ok(False)` if token record not found, or `Err(AppError)` if malformed.
    """
    try:
      decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
      user_id_str = decoded.get("sub")
      jti = decoded.get("jti")
      if not user_id_str or not jti:
        return Ok(False)
      user_id = UUID(str(user_id_str))
      jti_str = str(jti)
    except Exception as exc:
      logger.debug(f"Session revocation skipped for invalid token: {exc}")
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Invalid refresh token",
          status_code=status.HTTP_400_BAD_REQUEST,
        )
      )

    hashed_jti = security.hash_token_jti(jti_str)
    result = await db.execute(
      select(RefreshToken).where(
        RefreshToken.user_id == user_id,
        RefreshToken.token_hash.in_([hashed_jti, jti_str]),
      )
    )
    token_record = result.scalars().first()
    if token_record:
      token_record.is_revoked = True
      await db.commit()
      return Ok(True)
    return Ok(False)

  async def dispatch_reset_email_result(
    self,
    recipient: str,
    reset_token: str,
    email_service: EmailNotificationService,
  ) -> AppResult[bool]:
    """
    Dispatches a password reset email and wraps transport errors in `AppResult[bool]`.

    Args:
        recipient (str): Target email address.
        reset_token (str): Signed JWT password reset token.
        email_service (EmailNotificationService): Email delivery service.

    Returns:
        AppResult[bool]: `Ok(True)` if sent, or `Err(AppError)` with `EMAIL_DELIVERY_FAILED`.
    """
    try:
      await email_service.send_password_reset_email(recipient=recipient, reset_token=reset_token)
      return Ok(True)
    except Exception as e:
      logger.error(f"Failed to dispatch password reset email: {e}")
      return Err(
        AppError(
          code=ErrorCode.EMAIL_DELIVERY_FAILED,
          message=f"Failed to dispatch password reset email: {e!s}",
          status_code=status.HTTP_502_BAD_GATEWAY,
        )
      )

  async def forgot_password_result(
    self,
    payload: ForgotPasswordRequest,
    db: AsyncSession,
    email_service: EmailNotificationService,
  ) -> AppResult[PasswordResetResponse]:
    """
    Generates a password reset token for an existing user and dispatches instructions.

    Args:
        payload (ForgotPasswordRequest): Email address of requesting user.
        db (AsyncSession): Active PostgreSQL async session.
        email_service (EmailNotificationService): Transactional email service.

    Returns:
        AppResult[PasswordResetResponse]: `Ok(PasswordResetResponse)` with non-enumerating message.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    if user:
      reset_token = security.create_password_reset_token(email=user.email)
      await self.dispatch_reset_email_result(
        recipient=user.email,
        reset_token=reset_token,
        email_service=email_service,
      )

    return Ok(
      PasswordResetResponse(
        message="If the email exists, a password reset token has been dispatched.",
        reset_token=None,
      )
    )

  async def reset_password_result(
    self,
    payload: ResetPasswordRequest,
    db: AsyncSession,
  ) -> AppResult[PasswordResetResponse]:
    """
    Resets a user's password using a signed reset token and revokes active refresh tokens.

    Args:
        payload (ResetPasswordRequest): Reset token and new password.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[PasswordResetResponse]: `Ok(PasswordResetResponse)` or `Err(AppError)`.
    """
    email = security.verify_password_reset_token(payload.token)
    if not email:
      return Err(
        AppError(
          code=ErrorCode.AUTH_INVALID_TOKEN,
          message="Invalid or expired reset token",
          status_code=status.HTTP_400_BAD_REQUEST,
        )
      )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if not user:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message="User not found",
          status_code=status.HTTP_404_NOT_FOUND,
        )
      )

    user.hashed_password = security.get_password_hash(payload.new_password)

    token_res = await db.execute(
      select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.is_revoked.is_(False))
    )
    for token_rec in token_res.scalars().all():
      token_rec.is_revoked = True

    await db.commit()
    return Ok(PasswordResetResponse(message="Password reset successful."))


auth_service = AuthService()
