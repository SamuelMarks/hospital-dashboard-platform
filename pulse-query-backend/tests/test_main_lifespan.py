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
