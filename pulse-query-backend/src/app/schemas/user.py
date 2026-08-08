"""User-related API schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
  """Payload for registering a new user."""

  email: EmailStr
  password: str
  language_preference: str = "en"


class UserResponse(BaseModel):
  """Public representation of a user returned by the API."""

  id: UUID
  email: EmailStr
  is_active: bool
  is_admin: bool
  language_preference: str

  # Pydantic V2 config to read from SQLAlchemy models
  model_config = ConfigDict(from_attributes=True)
