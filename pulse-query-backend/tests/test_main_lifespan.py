"""
Tests for the FastAPI lifespan hook.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

import app.main as main_module


@pytest.mark.asyncio
async def test_lifespan_invokes_startup_and_shutdown(monkeypatch) -> None:
  """Lifespan should run startup steps and dispose engine on shutdown."""

  class _DummyConn:
    async def run_sync(self, _fn):
      return None

  class _DummyBegin:
    async def __aenter__(self):
      return _DummyConn()

    async def __aexit__(self, exc_type, exc, tb):
      return False

  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = _DummyBegin()
  dummy_engine.dispose = AsyncMock()

  dummy_validate_pg = AsyncMock(return_value={"status": "connected"})
  dummy_validate_duckdb = MagicMock(return_value={"status": "ready"})

  monkeypatch.setattr(main_module, "validate_postgres_connection", dummy_validate_pg)
  monkeypatch.setattr(main_module.duckdb_manager, "validate_duckdb_storage", dummy_validate_duckdb)
  monkeypatch.setattr(main_module, "engine", dummy_engine)
  monkeypatch.setattr(main_module, "data_ingestion_service", MagicMock(ingest_all_csvs=MagicMock()))
  monkeypatch.setattr(main_module, "TemplateSeeder", MagicMock(seed_defaults=AsyncMock()))
  monkeypatch.setattr(main_module, "init_duckdb_on_startup", MagicMock())

  async with main_module.lifespan(main_module.app):
    pass

  dummy_validate_pg.assert_awaited_once_with(raise_on_error=False)
  assert dummy_validate_duckdb.call_count == 2
  dummy_engine.begin.assert_called_once()
  dummy_engine.dispose.assert_awaited_once()
  main_module.data_ingestion_service.ingest_all_csvs.assert_called_once()
  main_module.TemplateSeeder.seed_defaults.assert_awaited_once()
  main_module.init_duckdb_on_startup.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_scheduled_background_ingest(monkeypatch) -> None:
  """Lifespan should spawn and cancel background ingestion task when AUTO_INGEST_INTERVAL_MINUTES > 0."""
  import asyncio

  class _DummyConn:
    async def run_sync(self, _fn):
      return None

  class _DummyBegin:
    async def __aenter__(self):
      return _DummyConn()

    async def __aexit__(self, exc_type, exc, tb):
      return False

  dummy_engine = MagicMock()
  dummy_engine.begin.return_value = _DummyBegin()
  dummy_engine.dispose = AsyncMock()

  dummy_validate_pg = AsyncMock(return_value={"status": "connected"})
  dummy_validate_duckdb = MagicMock(return_value={"status": "ready"})
  mock_ingest = MagicMock()

  monkeypatch.setattr(main_module, "validate_postgres_connection", dummy_validate_pg)
  monkeypatch.setattr(main_module.duckdb_manager, "validate_duckdb_storage", dummy_validate_duckdb)
  monkeypatch.setattr(main_module, "engine", dummy_engine)
  monkeypatch.setattr(main_module, "data_ingestion_service", MagicMock(ingest_all_csvs=mock_ingest))
  monkeypatch.setattr(main_module, "TemplateSeeder", MagicMock(seed_defaults=AsyncMock()))
  monkeypatch.setattr(main_module, "init_duckdb_on_startup", MagicMock())
  monkeypatch.setattr(main_module.settings, "AUTO_INGEST_INTERVAL_MINUTES", 1)

  async with main_module.lifespan(main_module.app):
    await asyncio.sleep(0.01)

  # Check that background loop function can run and handle cancellation
  cancelled_task = asyncio.create_task(main_module._background_ingest_loop(1))
  cancelled_task.cancel()
  try:
    await cancelled_task
  except asyncio.CancelledError:
    pass


@pytest.mark.asyncio
async def test_background_ingest_loop_iteration_and_exception(monkeypatch) -> None:
  """_background_ingest_loop should trigger ingest_all_csvs and handle exceptions gracefully."""
  import asyncio

  call_count = 0

  def fake_ingest():
    nonlocal call_count
    call_count += 1
    if call_count == 1:
      return 1
    raise RuntimeError("Ingest error")

  monkeypatch.setattr(main_module.data_ingestion_service, "ingest_all_csvs", fake_ingest)

  # Mock asyncio.sleep to execute loop immediately then cancel
  sleep_calls = 0

  async def fast_sleep(_sec):
    nonlocal sleep_calls
    sleep_calls += 1
    if sleep_calls > 2:
      raise asyncio.CancelledError()

  monkeypatch.setattr(asyncio, "sleep", fast_sleep)

  await main_module._background_ingest_loop(interval_minutes=1)
  assert call_count >= 2
