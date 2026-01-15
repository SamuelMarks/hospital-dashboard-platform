from pydantic import BaseModel, EmailStr, ConfigDict
from uuid import UUID


class UserCreate(BaseModel):
  email: EmailStr
  password: str


class UserResponse(BaseModel):
  id: UUID
  email: EmailStr
  is_active: bool

  # Pydantic V2 config to read from SQLAlchemy models
  model_config = ConfigDict(from_attributes=True)
