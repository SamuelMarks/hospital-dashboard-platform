"""Tests for conftest."""

import os
import tempfile
from collections.abc import AsyncGenerator
from typing import Any

import pydantic.root_model  # noqa: F401
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker

from app.database.postgres import Base, get_db

# Import models to ensure they are registered with Base.metadata before creation
from app.main import app
from app.database.duckdb import duckdb_manager
from app.services.data_ingestion import DataIngestionService
from app.database.duckdb_init import init_duckdb_on_startup

# Use a local SQLite file to avoid network/database dependencies in tests.
TEST_DB_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.db"
DUCKDB_TEST_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.duckdb"
duckdb_manager.db_path = DUCKDB_TEST_PATH

engine = create_engine(f"sqlite:///{TEST_DB_PATH}", future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(_type: Any, _compiler: Any, **_kw: Any) -> str:
  """
  Verify compile jsonb sqlite behavior.

  Args:
      _type: Test parameter or fixture.
      _compiler: Test parameter or fixture.
      _kw: Test parameter or fixture.
  """
  return "JSON"


class AsyncSessionShim:
  """
  Minimal async wrapper around a synchronous SQLAlchemy Session.
  This keeps the test interface async without requiring an async DB driver.
  """

  def __init__(self, session: Session) -> None:
    """
    Verify init behavior.

    Args:
        session: Test parameter or fixture.
    """
    self._session = session

  def add(self, instance: Any) -> None:
    """
    Verify add behavior.

    Args:
        instance: Test parameter or fixture.
    """
    self._session.add(instance)

  def add_all(self, instances: list[Any]) -> None:
    """
    Verify add all behavior.

    Args:
        instances: Test parameter or fixture.
    """
    self._session.add_all(instances)

  def expunge_all(self) -> None:
    """Verify expunge all behavior."""
    self._session.expunge_all()

  def expire_all(self) -> None:
    """Expires all persistent instances within this Session."""
    self._session.expire_all()

  async def execute(self, *args: Any, **kwargs: Any) -> Any:
    """
    Verify execute behavior.

    Args:
        args: Test parameter or fixture.
        kwargs: Test parameter or fixture.
    """
    return self._session.execute(*args, **kwargs)

  async def commit(self) -> None:
    """Verify commit behavior."""
    self._session.commit()

  async def flush(self) -> None:
    """Verify flush behavior."""
    self._session.flush()

  async def refresh(self, instance: Any, attribute_names: list[str] | None = None) -> None:
    """
    Verify refresh behavior.

    Args:
        instance: Test parameter or fixture.
        attribute_names: Test parameter or fixture.
    """
    self._session.refresh(instance, attribute_names=attribute_names)

  async def delete(self, instance: Any) -> None:
    """
    Verify delete behavior.

    Args:
        instance: Test parameter or fixture.
    """
    self._session.delete(instance)

  async def rollback(self) -> None:
    """Verify rollback behavior."""
    self._session.rollback()

  async def close(self) -> None:
    """Verify close behavior."""
    self._session.close()


@pytest_asyncio.fixture(loop_scope="function")
async def init_db() -> Any:
  """
  Initialize the database schema for the test.
  Drops existing tables to ensure a clean slate, then creates all tables.
  Also initializes the DuckDB instance for tests.
  """
  Base.metadata.drop_all(bind=engine)
  Base.metadata.create_all(bind=engine)

  DataIngestionService.ingest_all_csvs()
  init_duckdb_on_startup()

  yield

  Base.metadata.drop_all(bind=engine)


@pytest.fixture
async def db_session(init_db: Any) -> AsyncGenerator[Any, None]:
  """
  Dependency override for the database session.
  Yields a session for the test and rolls back the transaction after,
  keeping tests isolated.
  """
  session = SessionLocal()
  async_session = AsyncSessionShim(session)

  yield async_session

  await async_session.rollback()
  await async_session.close()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
  """
  HttpX AsyncClient fixture with the DB dependency overridden.
  Uses ASGITransport to test the app directly without binding a network port.
  """

  async def override_get_db() -> Any:
    """Verify override get db behavior."""
    yield db_session

  app.dependency_overrides[get_db] = override_get_db

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    yield ac

  app.dependency_overrides = {}
