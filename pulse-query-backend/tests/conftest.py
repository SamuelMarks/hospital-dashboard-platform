"""Pytest fixtures and test database harness configuration."""

from collections.abc import AsyncGenerator, Generator
import os
import tempfile

from httpx import ASGITransport, AsyncClient
from pydantic import RootModel
import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import init_duckdb_on_startup
from app.database.postgres import Base, get_db, register_sqlite_type_compilers
from app.main import app
from app.services.data_ingestion import DataIngestionService
from app.services.llm_client import llm_client


def _prewarm_pydantic_imports() -> type[RootModel[int]]:
  """
  Pre-warms `pydantic.root_model.RootModel` at test suite import time.

  Returns:
      type[RootModel[int]]: Parameterized `RootModel` class.
  """
  return RootModel[int]


_prewarm_pydantic_imports()
register_sqlite_type_compilers()

# Isolate LLM environment variables and global settings so `.env` or shell
# variables never trigger real Ollama/Cloud network connections during pytest.
for _llm_env_key in (
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "MISTRAL_API_KEY",
  "ANTHROPIC_API_KEY",
  "OLLAMA_MODELS",
  "LLM_LOCAL_MODELS",
):
  os.environ[_llm_env_key] = ""

settings.OPENAI_API_KEY = None
settings.GEMINI_API_KEY = None
settings.GOOGLE_API_KEY = None
settings.MISTRAL_API_KEY = None
settings.ANTHROPIC_API_KEY = None
settings.OLLAMA_MODELS = ""
settings.LLM_LOCAL_MODELS = ""
llm_client.init_swarm()

# Use a local SQLite file to avoid network/database dependencies in tests.
TEST_DB_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.db"
DUCKDB_TEST_PATH = f"{tempfile.gettempdir()}/pulse_query_test_{os.getpid()}.duckdb"
duckdb_manager.db_path = DUCKDB_TEST_PATH
settings.DUCKDB_PATH = DUCKDB_TEST_PATH

engine = create_engine(f"sqlite:///{TEST_DB_PATH}", future=True)
async_test_engine = create_async_engine(
  f"sqlite+aiosqlite:///{TEST_DB_PATH}",
  future=True,
  poolclass=NullPool,
)
TestingAsyncSessionLocal = async_sessionmaker(
  bind=async_test_engine,
  class_=AsyncSession,
  autoflush=False,
  autocommit=False,
  expire_on_commit=False,
)

# Backwards-compatible alias to genuine SQLAlchemy `AsyncSession`
AsyncSessionShim = AsyncSession


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
async def db_session(init_db: None) -> AsyncGenerator[AsyncSession, None]:
  """
  Provides an isolated SQLAlchemy `AsyncSession` database session per test.

  Args:
      init_db (None): Database initialization fixture dependency.

  Yields:
      AsyncSession: Active async SQLAlchemy database session.
  """
  _ = init_db
  async with TestingAsyncSessionLocal() as async_session:
    yield async_session
    await async_session.rollback()
  await async_test_engine.dispose()


@pytest_asyncio.fixture(loop_scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
  """
  Provides an `httpx.AsyncClient` bound to the FastAPI app with `get_db` overridden.

  Args:
      db_session (AsyncSession): Active test database session fixture.

  Yields:
      AsyncClient: Configured ASGI test client.
  """

  async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields the test `db_session` for FastAPI dependency injection.

    Yields:
        AsyncSession: The active test database session.
    """
    yield db_session

  app.dependency_overrides[get_db] = override_get_db

  async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
    yield ac

  app.dependency_overrides = {}


@pytest.fixture(autouse=True)
def isolate_llm_swarm() -> Generator[None, None, None]:
  """
  Ensures `llm_client.swarm` is reset to the isolated fallback mock state around each test.

  Yields:
      None: Control back to the active test function.
  """
  llm_client.init_swarm()
  yield
  llm_client.init_swarm()
