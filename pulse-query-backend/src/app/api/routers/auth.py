"""
Authentication API Router.

Handles user registration, login, token rotation, session revocation,
password reset flows, and profile management by delegating domain logic
to `AuthService`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.token import (
  ForgotPasswordRequest,
  PasswordResetResponse,
  RefreshTokenRequest,
  ResetPasswordRequest,
  Token,
)
from app.schemas.user import UserCreate, UserResponse
from app.services.auth_service import auth_service
from app.services.email import EmailNotificationService, get_email_service

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register_user(
  user_in: UserCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> User:
  """
  Registers a new user in the system and provisions their default dashboard.

  Args:
      user_in (UserCreate): The payload containing email and password.
      db (AsyncSession): Database session.
      accept_language (str | None): Optional HTTP `Accept-Language` header for localized error messages.

  Returns:
      User: The newly created user object.

  Raises:
      HTTPException: If email already exists.
  """
  res = await auth_service.register_user_result(user_in, db, accept_language=accept_language)
  return unwrap_or_raise_http(res)


@router.post("/login", response_model=Token)
async def login_access_token(
  form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Token:
  """
  OAuth2 compatible token login, issuing an access and refresh token pair.

  Args:
      form_data (OAuth2PasswordRequestForm): Login credentials (username=email).
      db (AsyncSession): Database session.
      accept_language (str | None): Optional HTTP `Accept-Language` header for localized error messages.

  Returns:
      Token: Access and refresh tokens.

  Raises:
      HTTPException: 400 on invalid credentials or inactive user.
  """
  res = await auth_service.login_access_token_result(
    username=form_data.username,
    password=form_data.password,
    db=db,
    accept_language=accept_language,
  )
  return unwrap_or_raise_http(res)


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
  res = await auth_service.refresh_access_token_result(payload, db)
  return unwrap_or_raise_http(res)


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
  await auth_service.revoke_session_result(payload, db)


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
  res = await auth_service.forgot_password_result(payload, db, email_service)
  return unwrap_or_raise_http(res)


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
  res = await auth_service.reset_password_result(payload, db)
  return unwrap_or_raise_http(res)


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(deps.get_current_user)]) -> User:
  """
  Fetches the current logged in user profile.

  Args:
      current_user (User): Authenticated user.

  Returns:
      User: Current user model instance.
  """
  return current_user
