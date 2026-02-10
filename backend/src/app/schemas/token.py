"""Token schemas for authentication payloads."""

from uuid import UUID
from pydantic import BaseModel


class Token(BaseModel):
  """OAuth2 access token response payload."""

  access_token: str
  token_type: str


class TokenPayload(BaseModel):
  """Decoded JWT payload used by auth dependencies."""

  sub: UUID | None = None
