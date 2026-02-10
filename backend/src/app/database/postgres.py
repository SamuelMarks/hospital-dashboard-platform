"""
PostgreSQL Database Module.

Defines the async SQLAlchemy engine, session factory, and dependency helper
used by FastAPI routes.
"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# 1. Create the Async Engine
# echo=True indicates logging SQL queries to console (good for dev)
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=False, future=True)

# 2. Create a Session Factory
AsyncSessionLocal = async_sessionmaker(
  bind=engine,
  class_=AsyncSession,
  expire_on_commit=False,
  autocommit=False,
  autoflush=False,
)


# 3. Define the Declarative Base for Models
class Base(DeclarativeBase):
  """Declarative base class for all SQLAlchemy models."""

  pass


# 4. Dependency for FastAPI Routes
async def get_db() -> AsyncGenerator[AsyncSession, None]:
  """
  Dependency to provide a database session per HTTP request.
  Closes the session automatically via yield/finally.
  """
  async with AsyncSessionLocal() as session:
    try:
      yield session
    finally:
      await session.close()
