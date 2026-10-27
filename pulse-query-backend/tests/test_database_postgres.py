"""
Tests for PostgreSQL dependency helpers and SQLite compatibility type compilers.
"""

from types import TracebackType
from unittest.mock import AsyncMock

import pytest

from app.database import postgres
from app.models import register_orm_models

type ExcType = type[BaseException] | None
type ExcVal = BaseException | None
type ExcTb = TracebackType | None


class _DummyContext:
  """Async context manager test double yielding a pre-configured session object."""

  def __init__(self, session: AsyncMock) -> None:
    """
    Initializes the dummy context manager with a mock session.

    Args:
        session (AsyncMock): Mock async database session.
    """
    self._session = session

  async def __aenter__(self) -> AsyncMock:
    """
    Enters the async context and returns the mock session.

    Returns:
        AsyncMock: Configured mock session.
    """
    return self._session

  async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> bool:
    """
    Exits the async context without suppressing exceptions.

    Args:
        exc_type (ExcType): Exception type if raised.
        exc (ExcVal): Exception instance if raised.
        tb (ExcTb): Traceback if raised.

    Returns:
        bool: Always False so exceptions propagate.
    """
    _ = (exc_type, exc, tb)
    return False


def test_register_orm_models() -> None:
  """Verifies `register_orm_models` returns all registered SQLAlchemy declarative model classes."""
  models = register_orm_models()
  model_names = {cls.__name__ for cls in models}
  assert {
    "AdminSetting",
    "AlertRule",
    "Conversation",
    "Dashboard",
    "DashboardShare",
    "ExperimentLog",
    "Message",
    "MessageCandidate",
    "ModelCandidate",
    "MpaxArenaCandidateRecord",
    "MpaxArenaRun",
    "RefreshToken",
    "User",
    "Widget",
    "WidgetTemplate",
  }.issubset(model_names)


@pytest.mark.asyncio
async def test_get_db_yields_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
  """Ensure `get_db` yields a session and closes it on teardown."""
  session = AsyncMock()
  monkeypatch.setattr(postgres, "AsyncSessionLocal", lambda: _DummyContext(session))

  generator = postgres.get_db()
  yielded = await anext(generator)

  assert yielded is session
  await generator.aclose()

  session.close.assert_awaited_once()


def test_sqlite_type_compilers() -> None:
  """Verifies `compile_jsonb_sqlite`, `compile_uuid_sqlite`, and `register_sqlite_type_compilers`."""
  postgres.register_sqlite_type_compilers()
  assert postgres.compile_jsonb_sqlite() == "JSON"
  assert postgres.compile_uuid_sqlite() == "TEXT"


@pytest.mark.asyncio
async def test_validate_postgres_duckdb_and_config_results(monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `validate_postgres_connection_result`, `validate_duckdb_storage_result`, and `check_configuration_hygiene_result`."""
  from app.core.diagnostics import check_configuration_hygiene_result
  from app.core.result import Err, ErrorCode, Ok
  from app.database.duckdb import duckdb_manager

  # Postgres Ok & Err
  monkeypatch.setattr(postgres, "validate_postgres_connection", AsyncMock(return_value={"status": "connected"}))
  pg_ok = await postgres.validate_postgres_connection_result()
  assert isinstance(pg_ok, Ok)

  monkeypatch.setattr(
    postgres,
    "validate_postgres_connection",
    AsyncMock(return_value={"status": "error", "error": "refused"}),
  )
  pg_err = await postgres.validate_postgres_connection_result()
  assert isinstance(pg_err, Err)
  assert pg_err.error.code == ErrorCode.POSTGRES_UNAVAILABLE

  # DuckDB Ok & Err
  monkeypatch.setattr(duckdb_manager, "validate_duckdb_storage", lambda: {"status": "ready"})
  dd_ok = duckdb_manager.validate_duckdb_storage_result()
  assert isinstance(dd_ok, Ok)

  monkeypatch.setattr(duckdb_manager, "validate_duckdb_storage", lambda: {"status": "error", "error": "locked"})
  dd_err = duckdb_manager.validate_duckdb_storage_result()
  assert isinstance(dd_err, Err)
  assert dd_err.error.code == ErrorCode.DUCKDB_STORAGE_ERROR

  # Config Hygiene Ok & Err
  class _DummySettings:
    """Dummy settings test double with a non-empty SECRET_KEY."""

    SECRET_KEY = "valid-secret"
    LLM_SWARM: list[dict[str, str]] = []

  assert isinstance(check_configuration_hygiene_result(_DummySettings()), Ok)

  class _EmptySecretSettings:
    """Dummy settings test double with a blank SECRET_KEY."""

    SECRET_KEY = "   "
    LLM_SWARM: list[dict[str, str]] = []

  cfg_err = check_configuration_hygiene_result(_EmptySecretSettings())
  assert isinstance(cfg_err, Err)
  assert cfg_err.error.code == ErrorCode.CONFIGURATION_ERROR
