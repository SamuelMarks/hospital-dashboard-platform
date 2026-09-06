"""
Tests for system health API, diagnostics router, and exception handlers.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
import os

import duckdb
from fastapi.testclient import TestClient
import pytest

from app.core.diagnostics import diagnostics_registry
import app.main as main_module
from app.services.data_ingestion import DataIngestionService
from app.services.template_seeder import TemplateSeeder

client = TestClient(main_module.app)


def test_get_system_health_endpoint() -> None:
  """GET /api/v1/system/health should return system status summary."""
  response = client.get("/api/v1/system/health")
  assert response.status_code == 200
  data = response.json()
  assert "overall_status" in data
  assert "postgres" in data
  assert "duckdb" in data
  assert "data" in data
  assert "templates" in data
  assert "llm" in data
  assert "warnings" in data


def test_get_system_health_strict_mode_when_critical(monkeypatch) -> None:
  """GET /api/v1/system/health?strict=true should return 503 when overall_status is critical."""
  monkeypatch.setattr(
    "app.api.routers.system.validate_postgres_connection",
    AsyncMock(return_value={"status": "error"}),
  )
  diagnostics_registry.postgres_status["status"] = "error"

  response = client.get("/api/v1/system/health?strict=true")
  assert response.status_code == 503
  data = response.json()
  assert data["detail"]["overall_status"] == "critical"


def test_get_system_diagnostics_endpoint() -> None:
  """GET /api/v1/system/diagnostics should return in-depth diagnostic environment checks."""
  response = client.get("/api/v1/system/diagnostics")
  assert response.status_code == 200
  data = response.json()
  assert "health" in data
  assert "environment_checks" in data
  assert "troubleshooting_guides" in data
  assert len(data["troubleshooting_guides"]) >= 3


def test_trigger_reingest_endpoint(monkeypatch) -> None:
  """POST /api/v1/system/reingest should invoke CSV auto-ingestion and return table counts."""
  monkeypatch.setattr("app.api.routers.system.data_ingestion_service.ingest_all_csvs", MagicMock())
  monkeypatch.setattr(
    "app.api.routers.system.duckdb_manager.validate_duckdb_storage",
    MagicMock(return_value={"status": "ready", "tables": {"hospital_data": 1200}}),
  )

  response = client.post("/api/v1/system/reingest")
  assert response.status_code == 200
  data = response.json()
  assert data["success"] is True
  assert "hospital_data" in data["tables"]


@pytest.mark.asyncio
async def test_duckdb_catalog_exception_handler() -> None:
  """duckdb_catalog_exception_handler should return structured 404 response."""
  dummy_request = MagicMock()
  exc = duckdb.CatalogException("Table with name missing_table does not exist!")
  res = await main_module.duckdb_catalog_exception_handler(dummy_request, exc)
  assert res.status_code == 404
  body = json.loads(res.body.decode())
  assert body["code"] == "TABLE_NOT_FOUND"
  assert "missing_table" in body["detail"]
  assert "remediation_hint" in body


@pytest.mark.asyncio
async def test_duckdb_database_exception_handler() -> None:
  """duckdb_database_exception_handler should return structured 500 response."""
  dummy_request = MagicMock()
  exc = duckdb.DatabaseError("Corrupted file header")
  res = await main_module.duckdb_database_exception_handler(dummy_request, exc)
  assert res.status_code == 500
  body = json.loads(res.body.decode())
  assert body["code"] == "DATABASE_ERROR"
  assert "Corrupted file header" in body["detail"]


@pytest.mark.asyncio
async def test_template_seeder_edge_cases(tmp_path, monkeypatch) -> None:
  """TemplateSeeder should handle missing file, empty list, and malformed JSON."""
  nonexistent_file = str(tmp_path / "nonexistent.json")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", nonexistent_file)
  await TemplateSeeder.seed_defaults()
  assert diagnostics_registry.template_status["missing_file"] is True

  empty_file = tmp_path / "empty.json"
  empty_file.write_text("[]", encoding="utf-8")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", str(empty_file))
  await TemplateSeeder.seed_defaults()
  assert diagnostics_registry.template_status["templates_loaded"] == 0

  invalid_file = tmp_path / "invalid.json"
  invalid_file.write_text("{broken json", encoding="utf-8")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", str(invalid_file))
  await TemplateSeeder.seed_defaults()
  assert any(w.code == "CORRUPTED_TEMPLATE_PACK" for w in diagnostics_registry.warnings)


def test_data_ingestion_edge_cases(tmp_path, monkeypatch) -> None:
  """DataIngestionService should handle missing data directory and ingestion errors."""
  empty_dir = str(tmp_path / "empty_data_dir")
  monkeypatch.setattr("app.services.data_ingestion.DATA_DIR", empty_dir)
  monkeypatch.setattr("app.services.data_ingestion.DEFAULT_CSV_PATH", os.path.join(empty_dir, "hospital_data.csv"))

  DataIngestionService.ingest_all_csvs()
  assert diagnostics_registry.data_status["fallback_generated"] is True
