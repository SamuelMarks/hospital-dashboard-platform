"""
PostgreSQL Database Module.

Defines the async SQLAlchemy engine, session factory, SQLite compatibility
type compilers, and dependency helper used by FastAPI routes.
"""

from collections.abc import AsyncGenerator
import logging
import time

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql.compiler import TypeCompiler
from sqlalchemy.sql.type_api import TypeEngine

from app.core.config import settings
from app.core.diagnostics import (
  PostgresDiagnosticState,
  PostgresStatusDict,
  diagnostics_registry,
  format_postgres_error_banner,
)
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonValue

logger = logging.getLogger(__name__)


def compile_jsonb_sqlite(
  _type: TypeEngine[JsonValue] | JSONB | None = None,
  _compiler: TypeCompiler | None = None,
  **_kw: str | int | bool | None,
) -> str:
  """
  Compiles PostgreSQL JSONB columns to SQLite JSON type.

  Args:
      _type (TypeEngine[JsonValue] | JSONB | None): SQLAlchemy column type instance.
      _compiler (TypeCompiler | None): SQLite type compiler instance.
      **_kw (str | int | bool | None): Additional compiler keyword arguments.

  Returns:
      str: SQLite column type string `"JSON"`.
  """
  return "JSON"


def compile_uuid_sqlite(
  _type: TypeEngine[str] | UUID[str] | None = None,
  _compiler: TypeCompiler | None = None,
  **_kw: str | int | bool | None,
) -> str:
  """
  Compiles PostgreSQL UUID columns to SQLite TEXT type.

  Args:
      _type (TypeEngine[str] | UUID[str] | None): SQLAlchemy column type instance.
      _compiler (TypeCompiler | None): SQLite type compiler instance.
      **_kw (str | int | bool | None): Additional compiler keyword arguments.

  Returns:
      str: SQLite column type string `"TEXT"`.
  """
  return "TEXT"


def register_sqlite_type_compilers() -> None:
  """
  Registers SQLite dialect type compilers for PostgreSQL `JSONB` and `UUID` column types.
  """
  compiles(JSONB, "sqlite")(compile_jsonb_sqlite)
  compiles(UUID, "sqlite")(compile_uuid_sqlite)


register_sqlite_type_compilers()

# 1. Create the Async Engine
# echo=True indicates logging SQL queries to console (good for dev)
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=False, future=True)


class DatabaseConfigurationError(RuntimeError):
  """Raised when PostgreSQL database is misconfigured or inaccessible during startup."""


async def validate_postgres_connection(raise_on_error: bool = False) -> PostgresStatusDict:
  """
  Verifies connectivity to the PostgreSQL instance and records diagnostic status.

  Args:
      raise_on_error (bool): Whether to raise DatabaseConfigurationError on connection failure.

  Returns:
      PostgresStatusDict: Diagnostic dictionary with status, latency_ms, and error details.

  Raises:
      DatabaseConfigurationError: If connection fails and raise_on_error is True.
  """
  start_time = time.perf_counter()
  try:
    async with engine.connect() as conn:
      await conn.execute(text("SELECT 1"))
    latency = round((time.perf_counter() - start_time) * 1000, 2)
    diagnostics_registry.postgres_status = PostgresDiagnosticState(
      status="connected",
      latency_ms=latency,
      details=f"PostgreSQL responding at {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}",
      error=None,
    )
    return diagnostics_registry.postgres_status.to_dict()
  except Exception as e:
    latency = round((time.perf_counter() - start_time) * 1000, 2)
    error_str = str(e)
    banner = format_postgres_error_banner(
      host=settings.POSTGRES_SERVER,
      port=settings.POSTGRES_PORT,
      user=settings.POSTGRES_USER,
      database=settings.POSTGRES_DB,
      error_message=error_str,
    )
    logger.error(f"\n{banner}")
    diagnostics_registry.postgres_status = PostgresDiagnosticState(
      status="error",
      latency_ms=latency,
      details=f"Failed connecting to {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}",
      error=error_str,
    )
    diagnostics_registry.add_warning(
      code="POSTGRES_UNAVAILABLE",
      message=f"PostgreSQL connection failed: {error_str}",
      severity="critical",
      remediation="Verify POSTGRES_* settings in .env and ensure database container is running.",
    )
    if raise_on_error:
      raise DatabaseConfigurationError(
        f"PostgreSQL database connection failed for {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}: {error_str}"
      ) from e
    return diagnostics_registry.postgres_status.to_dict()


async def validate_postgres_connection_result() -> AppResult[PostgresStatusDict]:
  """
  Verifies PostgreSQL connectivity and returns an explicit `AppResult` wrapping the status dictionary.

  Returns:
      AppResult[PostgresStatusDict]: `Ok(status)` when connected, or `Err(AppError)` with `POSTGRES_UNAVAILABLE`.
  """
  status_dict = await validate_postgres_connection(raise_on_error=False)
  if status_dict.get("status") == "error":
    return Err(
      AppError(
        code=ErrorCode.POSTGRES_UNAVAILABLE,
        message=str(status_dict.get("error") or "PostgreSQL unavailable"),
        status_code=503,
        details={
          "status": status_dict.get("status"),
          "latency_ms": status_dict.get("latency_ms"),
          "details": status_dict.get("details"),
          "error": status_dict.get("error"),
        },
      )
    )
  return Ok(status_dict)


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


# 4. Dependency for FastAPI Routes
async def get_db() -> AsyncGenerator[AsyncSession, None]:
  """
  Dependency to provide a database session per HTTP request.
  Closes the session automatically via yield/finally.

  Yields:
      AsyncSession: Active PostgreSQL async session.
  """
  async with AsyncSessionLocal() as session:
    try:
      yield session
    finally:
      await session.close()
