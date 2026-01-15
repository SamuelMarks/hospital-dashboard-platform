"""
Authentication API Router.

Handles user registration, login, and profile management.
Updated to include automatic provisioning of default dashboards upon registration.
"""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserResponse
from app.services.provisioning import provisioning_service  # New Dependency

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register_user(user_in: UserCreate, db: Annotated[AsyncSession, Depends(get_db)]) -> User:
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
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="The user with this email already exists in the system.",
    )

  # 2. Create User
  user = User(
    email=user_in.email,
    hashed_password=security.get_password_hash(user_in.password),
    is_active=True,
  )
  db.add(user)

  # 3. Flush to generate the UUID for the user so we can link the dashboard
  await db.flush()

  # 4. Provision Default Assets (The 30 Questions Dashboard)
  await provisioning_service.provision_new_user(db, user)

  # 5. Commit everything atomically
  await db.commit()
  await db.refresh(user)
  return user


@router.post("/login", response_model=Token)
async def login_access_token(
  form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
  db: Annotated[AsyncSession, Depends(get_db)],
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
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect email or password")

  if not user.is_active:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

  # 2. Generate Token
  access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

  return Token(
    access_token=security.create_access_token(subject=user.id, expires_delta=access_token_expires),
    token_type="bearer",
  )


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(deps.get_current_user)]) -> User:
  """
  Fetch the current logged in user profile.
  """
  return current_user
