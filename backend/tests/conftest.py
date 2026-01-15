import asyncio
from typing import AsyncGenerator

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.database.postgres import Base, get_db

# Import models to ensure they are registered with Base.metadata before creation
from app.models.user import User
from app.models.dashboard import Dashboard, Widget
from app.main import app

# Create a specific engine for testing.
# NullPool is important for async tests to allow clean teardown of connections.
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, poolclass=NullPool)


@pytest.fixture
async def init_db():
  """
  Initialize the database schema for the test.
  Drops existing tables to ensure a clean slate, then creates all tables.

  Changed from session scope to default (function) scope to ensure compatibility
  with pytest-anyio which manages event loops per test.
  """
  async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.drop_all)
    await conn.run_sync(Base.metadata.create_all)

  yield

  async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(init_db) -> AsyncGenerator[AsyncSession, None]:
  """
  Dependency override for the database session.
  Yields a session for the test and rolls back the transaction after,
  keeping tests isolated.
  """
  connection = await engine.connect()
  transaction = await connection.begin()

  # Valid for SQLAlchemy 1.4+ with asyncio, ensuring nested support
  session = AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")

  yield session

  # Cleanup: Rollback the outer transaction to discard any changes made during the test
  await session.close()
  if transaction.is_active:
    await transaction.rollback()
  await connection.close()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
  """
  HttpX AsyncClient fixture with the DB dependency overridden.
  Uses ASGITransport to test the app directly without binding a network port.
  """

  async def override_get_db():
    yield db_session

  app.dependency_overrides[get_db] = override_get_db

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    yield ac

  app.dependency_overrides = {}
