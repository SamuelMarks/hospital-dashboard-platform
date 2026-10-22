"""
Tests for the FastAPI lifespan hook.
"""

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.main as main_module


@pytest.mark.asyncio
async def test_lifespan_invokes_startup_and_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
  """Lifespan should run startup steps and dispose engine on shutdown."""

  class _DummyConn:
    """Stub async database connection supporting `run_sync`."""

    async def run_sync(self, _fn: object) -> None:
      """
      No-op `run_sync` hook.

      Args:
          _fn (object): Synchronous callable.
      """
      return

  class _DummyBegin:
    """Stub async context manager returned by `engine.begin()`."""

    async def __aenter__(self) -> _DummyConn:
      """
      Enters the transaction context and returns `_DummyConn`.

      Returns:
          _DummyConn: Stub connection.
      """
      return _DummyConn()

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> bool:
      """
      Exits the transaction context without suppressing exceptions.

      Args:
          exc_type (object): Exception type if raised.
          exc (object): Exception instance if raised.
          tb (object): Traceback if raised.

      Returns:
          bool: Always False.
      """
      return False

  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = _DummyBegin()
  dummy_engine.dispose = AsyncMock()

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

  class _DummyConn:
    """Stub async database connection supporting `run_sync`."""

    async def run_sync(self, _fn: object) -> None:
      """
      No-op `run_sync` hook.

      Args:
          _fn (object): Synchronous callable.
      """
      return

  class _DummyBegin:
    """Stub async context manager returned by `engine.begin()`."""

    async def __aenter__(self) -> _DummyConn:
      """
      Enters the transaction context and returns `_DummyConn`.

      Returns:
          _DummyConn: Stub connection.
      """
      return _DummyConn()

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> bool:
      """
      Exits the transaction context without suppressing exceptions.

      Args:
          exc_type (object): Exception type if raised.
          exc (object): Exception instance if raised.
          tb (object): Traceback if raised.

      Returns:
          bool: Always False.
      """
      return False

  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = _DummyBegin()
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

  async with main_module.lifespan(main_module.app):
    await asyncio.sleep(0.01)

  cancelled_task = asyncio.create_task(main_module._background_ingest_loop(1))
  cancelled_task.cancel()
  with contextlib.suppress(asyncio.CancelledError):
    await cancelled_task


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
