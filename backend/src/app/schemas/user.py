"""User-related API schemas."""

from pydantic import BaseModel, EmailStr, ConfigDict
from uuid import UUID


class UserCreate(BaseModel):
  """Payload for registering a new user."""

  email: EmailStr
  password: str


class UserResponse(BaseModel):
  """Public representation of a user returned by the API."""

  id: UUID
  email: EmailStr
  is_active: bool
  is_admin: bool

  # Pydantic V2 config to read from SQLAlchemy models
  model_config = ConfigDict(from_attributes=True)
