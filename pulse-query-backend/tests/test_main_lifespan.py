"""
Tests for the FastAPI lifespan hook.
"""

import asyncio
from collections.abc import Callable
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.engine import Connection

from app.core.diagnostics import diagnostics_registry
from app.database.postgres import Base
import app.main as main_module
from tests.typed_test_doubles import ExcTb, ExcType, ExcVal, TypedAsyncContextManager, TypedSyncContextManager


class _DummyConn:
  """Stub async database connection supporting `run_sync`."""

  def __init__(self) -> None:
    """Initializes the list of recorded `run_sync` callables."""
    self.synced_fns: list[Callable[[Connection], None]] = []

  async def run_sync(self, fn: Callable[[Connection], None]) -> None:
    """
    Records `fn` to verify `Base.metadata.create_all` was invoked.

    Args:
        fn (Callable[[Connection], None]): Synchronous DDL callable.
    """
    self.synced_fns.append(fn)


@pytest.mark.asyncio
async def test_lifespan_invokes_startup_and_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
  """Lifespan should run startup steps and dispose engine on shutdown."""
  dummy_conn = _DummyConn()
  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = TypedAsyncContextManager(dummy_conn)
  dummy_engine.dispose = AsyncMock()
  sync_cm = TypedSyncContextManager(dummy_conn)
  with sync_cm as entered_sync:
    assert entered_sync is dummy_conn

  dummy_validate_pg = AsyncMock(return_value={"status": "connected"})
  dummy_validate_duckdb = MagicMock(return_value={"status": "ready"})
  mock_ingest_svc = MagicMock(ingest_all_csvs=MagicMock())
  mock_seeder = MagicMock(seed_defaults=AsyncMock())
  mock_init_duckdb = MagicMock()

  monkeypatch.setattr(main_module, "validate_postgres_connection", dummy_validate_pg)
  monkeypatch.setattr(main_module, "duckdb_manager", MagicMock(validate_duckdb_storage=dummy_validate_duckdb))
  monkeypatch.setattr(main_module, "engine", dummy_engine)
  monkeypatch.setattr(main_module, "data_ingestion_service", mock_ingest_svc)
  monkeypatch.setattr(main_module, "TemplateSeeder", mock_seeder)
  monkeypatch.setattr(main_module, "init_duckdb_on_startup", mock_init_duckdb)

  async with main_module.lifespan(main_module.app):
    pass

  assert dummy_conn.synced_fns == [Base.metadata.create_all]
  dummy_validate_pg.assert_awaited_once_with(raise_on_error=False)
  assert dummy_validate_duckdb.call_count == 2
  dummy_engine.begin.assert_called_once()
  dummy_engine.dispose.assert_awaited_once()
  mock_ingest_svc.ingest_all_csvs.assert_called_once()
  mock_seeder.seed_defaults.assert_awaited_once()
  mock_init_duckdb.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_scheduled_background_ingest(monkeypatch: pytest.MonkeyPatch) -> None:
  """Lifespan should spawn and cancel background ingestion task when AUTO_INGEST_INTERVAL_MINUTES > 0."""
  dummy_conn = _DummyConn()
  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = TypedAsyncContextManager(dummy_conn)
  dummy_engine.dispose = AsyncMock()

  dummy_validate_pg = AsyncMock(return_value={"status": "connected"})
  dummy_validate_duckdb = MagicMock(return_value={"status": "ready"})
  mock_ingest = MagicMock()

  monkeypatch.setattr(main_module, "validate_postgres_connection", dummy_validate_pg)
  monkeypatch.setattr(main_module, "duckdb_manager", MagicMock(validate_duckdb_storage=dummy_validate_duckdb))
  monkeypatch.setattr(main_module, "engine", dummy_engine)
  monkeypatch.setattr(main_module, "data_ingestion_service", MagicMock(ingest_all_csvs=mock_ingest))
  monkeypatch.setattr(main_module, "TemplateSeeder", MagicMock(seed_defaults=AsyncMock()))
  monkeypatch.setattr(main_module, "init_duckdb_on_startup", MagicMock())
  monkeypatch.setattr(main_module, "settings", MagicMock(AUTO_INGEST_INTERVAL_MINUTES=1))

  real_sleep = asyncio.sleep
  tick_event = asyncio.Event()

  async def _fast_bg_sleep(_seconds: float) -> None:
    """
    Advances the background ingestion timer immediately and sets `tick_event`.

    Args:
        _seconds (float): Requested sleep interval in seconds.
    """
    tick_event.set()
    await real_sleep(0.005)

  monkeypatch.setattr(asyncio, "sleep", _fast_bg_sleep)

  async with main_module.lifespan(main_module.app):
    await asyncio.wait_for(tick_event.wait(), timeout=1.0)
    await real_sleep(0.01)

  # Startup called ingest_all_csvs once, and background task called it at least once more
  assert mock_ingest.call_count >= 2


@pytest.mark.asyncio
async def test_background_ingest_loop_iteration_and_exception(monkeypatch: pytest.MonkeyPatch) -> None:
  """`_background_ingest_loop` should trigger `ingest_all_csvs` and handle exceptions gracefully."""
  call_count = 0

  def fake_ingest() -> int:
    """
    Increments `call_count` and raises `RuntimeError` on the second invocation.

    Returns:
        int: 1 on the first invocation.

    Raises:
        RuntimeError: On subsequent invocations.
    """
    nonlocal call_count
    call_count += 1
    if call_count == 1:
      return 1
    raise RuntimeError("Ingest error")

  monkeypatch.setattr(main_module, "data_ingestion_service", MagicMock(ingest_all_csvs=fake_ingest))

  sleep_calls = 0

  async def fast_sleep(_sec: float) -> None:
    """
    Raises `asyncio.CancelledError` after two iterations to terminate the loop.

    Args:
        _sec (float): Sleep duration in seconds.

    Raises:
        asyncio.CancelledError: When `sleep_calls > 2`.
    """
    nonlocal sleep_calls
    sleep_calls += 1
    if sleep_calls > 2:
      raise asyncio.CancelledError()

  monkeypatch.setattr(asyncio, "sleep", fast_sleep)

  await main_module._background_ingest_loop(interval_minutes=1)
  assert call_count >= 2


@pytest.mark.asyncio
async def test_lifespan_handles_postgres_schema_init_error(monkeypatch: pytest.MonkeyPatch) -> None:
  """Lifespan should log and record a critical warning when engine.begin() fails on startup."""
  monkeypatch.setattr(main_module, "check_configuration_hygiene", MagicMock())
  monkeypatch.setattr(main_module, "validate_postgres_connection", AsyncMock(return_value={"status": "error"}))

  class _FailingBeginCM:
    """Stub async context manager raising RuntimeError on enter."""

    async def __aenter__(self) -> None:
      """Raise error on enter."""
      raise RuntimeError("schema init failed")

    async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> bool:
      """Exit context."""
      _ = (exc_type, exc, tb)
      return False

  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = _FailingBeginCM()
  dummy_engine.dispose = AsyncMock()
  monkeypatch.setattr(main_module, "engine", dummy_engine)

  mock_duck_mgr = MagicMock()
  monkeypatch.setattr(main_module, "duckdb_manager", mock_duck_mgr)
  monkeypatch.setattr(main_module, "data_ingestion_service", MagicMock())
  mock_seeder = MagicMock()
  mock_seeder.seed_defaults = AsyncMock()
  monkeypatch.setattr(main_module, "TemplateSeeder", mock_seeder)
  monkeypatch.setattr(main_module, "init_duckdb_on_startup", MagicMock())
  monkeypatch.setattr("app.main.settings.AUTO_INGEST_INTERVAL_MINUTES", 0)

  async with main_module.lifespan(main_module.app):
    pass

  assert any(w.code == "POSTGRES_SCHEMA_INIT_FAILED" for w in diagnostics_registry.warnings)
