"""Pytest fixtures and test database harness configuration."""

import os
import tempfile
from collections.abc import AsyncGenerator
from typing import Any

import pydantic.root_model  # noqa: F401
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import Executable

from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import init_duckdb_on_startup
from app.database.postgres import Base, get_db, register_sqlite_type_compilers
from app.main import app
from app.services.data_ingestion import DataIngestionService

register_sqlite_type_compilers()

# Use a local SQLite file to avoid network/database dependencies in tests.
TEST_DB_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.db"
DUCKDB_TEST_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.duckdb"
duckdb_manager.db_path = DUCKDB_TEST_PATH

engine = create_engine(f"sqlite:///{TEST_DB_PATH}", future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class AsyncSessionShim:
  """
  Minimal async wrapper around a synchronous SQLAlchemy Session.
  This keeps the test interface async without requiring an async DB driver.
  """

  def __init__(self, session: Session) -> None:
    """
    Initializes the async session wrapper around a synchronous SQLAlchemy session.

    Args:
        session (Session): Synchronous SQLAlchemy ORM session.
    """
    self._session = session

  def add(self, instance: object) -> None:
    """
    Stages a single ORM model instance in the underlying session.

    Args:
        instance (object): SQLAlchemy ORM entity to add.
    """
    self._session.add(instance)

  def add_all(self, instances: list[Any]) -> None:
    """
    Stages multiple ORM model instances in the underlying session.

    Args:
        instances (list[Any]): Sequence of SQLAlchemy ORM entities to add.
    """
    self._session.add_all(instances)

  def expunge_all(self) -> None:
    """Removes all object instances from the underlying SQLAlchemy session."""
    self._session.expunge_all()

  def expire_all(self) -> None:
    """Expires all persistent instances within this Session."""
    self._session.expire_all()

  async def execute(self, statement: Executable) -> Result[Any]:
    """
    Executes a SQLAlchemy statement against the synchronous session.

    Args:
        statement (Executable): SQLAlchemy selectable or executable construct.

    Returns:
        Result[Any]: SQLAlchemy `Result` object.
    """
    return self._session.execute(statement)

  async def commit(self) -> None:
    """Commits the current transaction on the underlying session."""
    self._session.commit()

  async def flush(self) -> None:
    """Flushes pending object changes to the database transaction."""
    self._session.flush()

  async def refresh(self, instance: object, attribute_names: list[str] | None = None) -> None:
    """
    Refreshes the attributes of an ORM instance from the database.

    Args:
        instance (object): ORM model instance to refresh.
        attribute_names (list[str] | None): Optional subset of attribute names to refresh.
    """
    self._session.refresh(instance, attribute_names=attribute_names)

  async def delete(self, instance: object) -> None:
    """
    Marks an ORM model instance as deleted in the underlying session.

    Args:
        instance (object): ORM model instance to delete.
    """
    self._session.delete(instance)

  async def rollback(self) -> None:
    """Rolls back the current transaction on the underlying session."""
    self._session.rollback()

  async def close(self) -> None:
    """Closes the underlying synchronous SQLAlchemy session."""
    self._session.close()


@pytest_asyncio.fixture(loop_scope="function")
async def init_db() -> AsyncGenerator[None, None]:
  """
  Initializes the database schema and DuckDB instance for an isolated test run.

  Yields:
      None: Control back to the test after schema creation and CSV ingestion.
  """
  Base.metadata.drop_all(bind=engine)
  Base.metadata.create_all(bind=engine)

  DataIngestionService.ingest_all_csvs()
  init_duckdb_on_startup()

  yield

  Base.metadata.drop_all(bind=engine)


@pytest_asyncio.fixture(loop_scope="function")
async def db_session(init_db: None) -> AsyncGenerator[AsyncSessionShim, None]:
  """
  Provides an isolated `AsyncSessionShim` database session per test.

  Args:
      init_db (None): Database initialization fixture dependency.

  Yields:
      AsyncSessionShim: Active async-compatible database session shim.
  """
  _ = init_db
  session = SessionLocal()
  async_session = AsyncSessionShim(session)

  yield async_session

  await async_session.rollback()
  await async_session.close()


@pytest_asyncio.fixture(loop_scope="function")
async def client(db_session: AsyncSessionShim) -> AsyncGenerator[AsyncClient, None]:
  """
  Provides an `httpx.AsyncClient` bound to the FastAPI app with `get_db` overridden.

  Args:
      db_session (AsyncSessionShim): Active test database session fixture.

  Yields:
      AsyncClient: Configured ASGI test client.
  """

  async def override_get_db() -> AsyncGenerator[AsyncSessionShim, None]:
    """
    Yields the test `db_session` for FastAPI dependency injection.

    Yields:
        AsyncSessionShim: The active test database session.
    """
    yield db_session

  app.dependency_overrides[get_db] = override_get_db

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    yield ac

  app.dependency_overrides = {}
