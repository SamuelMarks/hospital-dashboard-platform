import asyncio
import os
import tempfile
from typing import AsyncGenerator, Any, Optional

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.database.postgres import Base, get_db

# Import models to ensure they are registered with Base.metadata before creation
from app.models.user import User
from app.models.dashboard import Dashboard, Widget
from app.main import app

# Use a local SQLite file to avoid network/database dependencies in tests.
TEST_DB_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.db"
engine = create_engine(f"sqlite:///{TEST_DB_PATH}", future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(_type, _compiler, **_kw) -> str:
  return "JSON"


class AsyncSessionShim:
  """
  Minimal async wrapper around a synchronous SQLAlchemy Session.
  This keeps the test interface async without requiring an async DB driver.
  """

  def __init__(self, session: Session) -> None:
    self._session = session

  def add(self, instance: Any) -> None:
    self._session.add(instance)

  def add_all(self, instances: list[Any]) -> None:
    self._session.add_all(instances)

  def expunge_all(self) -> None:
    self._session.expunge_all()

  def expire_all(self) -> None:
    """Expires all persistent instances within this Session."""
    self._session.expire_all()

  async def execute(self, *args: Any, **kwargs: Any) -> Any:
    return self._session.execute(*args, **kwargs)

  async def commit(self) -> None:
    self._session.commit()

  async def flush(self) -> None:
    self._session.flush()

  async def refresh(self, instance: Any, attribute_names: Optional[list[str]] = None) -> None:
    self._session.refresh(instance, attribute_names=attribute_names)

  async def delete(self, instance: Any) -> None:
    self._session.delete(instance)

  async def rollback(self) -> None:
    self._session.rollback()

  async def close(self) -> None:
    self._session.close()


@pytest_asyncio.fixture(loop_scope="function")
async def init_db():
  """
  Initialize the database schema for the test.
  Drops existing tables to ensure a clean slate, then creates all tables.

  Using pytest_asyncio.fixture explicitly resolves warnings in strict mode.
  """
  Base.metadata.drop_all(bind=engine)
  Base.metadata.create_all(bind=engine)

  yield

  Base.metadata.drop_all(bind=engine)


@pytest.fixture
async def db_session(init_db) -> AsyncGenerator[AsyncSession, None]:
  """
  Dependency override for the database session.
  Yields a session for the test and rolls back the transaction after,
  keeping tests isolated.
  """
  session = SessionLocal()
  # We return our shim, typed as AsyncSession for static analysis but executing synchronously
  async_session = AsyncSessionShim(session)  # type: ignore

  yield async_session

  await async_session.rollback()
  await async_session.close()


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
