"""Token schemas for authentication payloads."""

from uuid import UUID

from pydantic import BaseModel


class Token(BaseModel):
  """OAuth2 access and refresh token response payload."""

  access_token: str
  token_type: str = "bearer"
  refresh_token: str | None = None
  expires_in: int = 3600


class TokenPayload(BaseModel):
  """Decoded JWT payload used by auth dependencies."""

  sub: UUID | None = None


class RefreshTokenRequest(BaseModel):
  """Payload requesting rotation of an active refresh token."""

  refresh_token: str


class ForgotPasswordRequest(BaseModel):
  """Payload requesting a time-bound password reset token."""

  email: str


class ResetPasswordRequest(BaseModel):
  """Payload supplying reset token and the replacement password."""

  token: str
  new_password: str


class PasswordResetResponse(BaseModel):
  """Status confirmation after password reset or email dispatch."""

  message: str
  reset_token: str | None = None
