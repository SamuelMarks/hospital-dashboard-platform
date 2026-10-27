"""
Tests for system health API, diagnostics router, and exception handlers.
"""

import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import duckdb
from fastapi.testclient import TestClient
import pytest

import app.api.deps as deps
from app.core.diagnostics import diagnostics_registry
import app.main as main_module
from app.services.data_ingestion import DataIngestionService
from app.services.template_seeder import TemplateSeeder

client = TestClient(main_module.app)


def test_get_system_health_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
  """GET /api/v1/system/health should return 200 OK when Postgres, DuckDB datasets, and templates are populated."""
  monkeypatch.setattr(
    "app.services.system_service.validate_postgres_connection",
    AsyncMock(return_value={"status": "connected", "latency_ms": 1.0, "details": "ok", "error": None}),
  )
  monkeypatch.setattr(
    "app.services.system_service.duckdb_manager.validate_duckdb_storage",
    MagicMock(
      return_value={
        "status": "ready",
        "path": ":memory:",
        "tables": {"hospital_data": 700, "synthetic_hospital_data_transfers": 41692},
        "total_tables": 2,
        "error": None,
      }
    ),
  )
  monkeypatch.setattr(
    "app.services.system_service.system_diagnostics_service._query_template_count",
    AsyncMock(return_value=29),
  )

  response = client.get("/api/v1/system/health")
  assert response.status_code == 200
  assert "no-store" in response.headers.get("cache-control", "")
  data = response.json()
  assert data["status"] == "healthy"
  assert data["overall_status"] == "healthy"
  assert data["database"] == {"postgres": True, "duckdb": True}
  assert data["datasets"]["status"] == "ready"
  assert data["datasets"]["table_count"] == 2
  assert data["datasets"]["row_counts"]["hospital_data"] == 700
  assert data["datasets"]["row_counts"]["Synthetic_hospital_data_transfers"] == 41692
  assert data["templates"]["status"] == "ready"
  assert data["templates"]["template_count"] == 29
  assert "postgres" in data
  assert "duckdb" in data
  assert "data" in data
  assert "llm" in data
  assert "warnings" in data


def test_get_system_health_strict_mode_when_critical(monkeypatch: pytest.MonkeyPatch) -> None:
  """GET /api/v1/system/health?strict=true should return 503 with full SystemHealthResponse when critical."""
  monkeypatch.setattr(
    "app.services.system_service.validate_postgres_connection",
    AsyncMock(return_value={"status": "error", "latency_ms": None, "details": None, "error": "down"}),
  )
  diagnostics_registry.postgres_status.status = "error"

  response = client.get("/api/v1/system/health?strict=true")
  assert response.status_code == 503
  data = response.json()
  assert data["status"] == "critical"
  assert data["overall_status"] == "critical"
  assert data["database"]["postgres"] is False
  assert data["templates"]["status"] == "critical"


def test_get_system_health_returns_503_when_datasets_empty(monkeypatch: pytest.MonkeyPatch) -> None:
  """GET /api/v1/system/health should return 503 when DuckDB has 0 tables or missing clinical tables."""
  monkeypatch.setattr(
    "app.services.system_service.validate_postgres_connection",
    AsyncMock(return_value={"status": "connected", "latency_ms": 1.0, "details": "ok", "error": None}),
  )
  monkeypatch.setattr(
    "app.services.system_service.duckdb_manager.validate_duckdb_storage",
    MagicMock(
      return_value={
        "status": "ready",
        "path": ":memory:",
        "tables": {},
        "total_tables": 0,
        "error": None,
      }
    ),
  )
  monkeypatch.setattr(
    "app.services.system_service.system_diagnostics_service._query_template_count",
    AsyncMock(return_value=15),
  )

  response = client.get("/api/v1/system/health")
  assert response.status_code == 503
  data = response.json()
  assert data["status"] == "unhealthy"
  assert data["overall_status"] == "unhealthy"
  assert data["datasets"]["status"] == "empty"
  assert data["datasets"]["table_count"] == 0
  assert data["templates"]["status"] == "ready"

  # Also verify strict=false returns 503 with 'degraded' status
  response_non_strict = client.get("/api/v1/system/health?strict=false")
  assert response_non_strict.status_code == 503
  assert response_non_strict.json()["status"] == "degraded"


def test_get_system_health_returns_503_when_templates_empty(monkeypatch: pytest.MonkeyPatch) -> None:
  """GET /api/v1/system/health should return 503 when PostgreSQL has 0 templates."""
  monkeypatch.setattr(
    "app.services.system_service.validate_postgres_connection",
    AsyncMock(return_value={"status": "connected", "latency_ms": 1.0, "details": "ok", "error": None}),
  )
  monkeypatch.setattr(
    "app.services.system_service.duckdb_manager.validate_duckdb_storage",
    MagicMock(
      return_value={
        "status": "ready",
        "path": ":memory:",
        "tables": {"hospital_data": 500, "Synthetic_hospital_data_transfers": 300},
        "total_tables": 2,
        "error": None,
      }
    ),
  )
  monkeypatch.setattr(
    "app.services.system_service.system_diagnostics_service._query_template_count",
    AsyncMock(return_value=0),
  )

  response = client.get("/api/v1/system/health")
  assert response.status_code == 503
  data = response.json()
  assert data["status"] == "unhealthy"
  assert data["overall_status"] == "unhealthy"
  assert data["datasets"]["status"] == "ready"
  assert data["datasets"]["row_counts"]["synthetic_hospital_data_transfers"] == 300
  assert data["templates"]["status"] == "empty"
  assert data["templates"]["template_count"] == 0


def test_get_system_health_returns_503_when_duckdb_error(monkeypatch: pytest.MonkeyPatch) -> None:
  """GET /api/v1/system/health should return 503 critical when DuckDB storage validation fails."""
  monkeypatch.setattr(
    "app.services.system_service.validate_postgres_connection",
    AsyncMock(return_value={"status": "connected", "latency_ms": 1.0, "details": "ok", "error": None}),
  )
  monkeypatch.setattr(
    "app.services.system_service.duckdb_manager.validate_duckdb_storage",
    MagicMock(
      return_value={
        "status": "error",
        "path": ":memory:",
        "tables": {},
        "total_tables": 0,
        "error": "locked",
      }
    ),
  )
  monkeypatch.setattr(
    "app.services.system_service.system_diagnostics_service._query_template_count",
    AsyncMock(return_value=12),
  )

  response = client.get("/api/v1/system/health")
  assert response.status_code == 503
  data = response.json()
  assert data["status"] == "critical"
  assert data["datasets"]["status"] == "critical"


@pytest.mark.asyncio
async def test_query_template_count_branches(monkeypatch: pytest.MonkeyPatch) -> None:
  """_query_template_count should support explicit db session, AsyncSessionLocal, and registry fallback."""
  from app.services.system_service import system_diagnostics_service

  mock_db = AsyncMock()
  mock_res = MagicMock()
  mock_res.scalar_one_or_none.return_value = 18
  mock_db.execute.return_value = mock_res

  count_with_db = await system_diagnostics_service._query_template_count(db=mock_db)
  assert count_with_db == 18

  from tests.typed_test_doubles import TypedAsyncContextManager

  monkeypatch.setattr("app.services.system_service.AsyncSessionLocal", lambda: TypedAsyncContextManager(mock_db))
  count_via_session_local = await system_diagnostics_service._query_template_count(db=None)
  assert count_via_session_local == 18

  def _failing_session_local() -> None:
    """Raises RuntimeError to test fallback."""
    raise RuntimeError("no db")

  monkeypatch.setattr("app.services.system_service.AsyncSessionLocal", _failing_session_local)
  diagnostics_registry.template_status.templates_loaded = 11
  count_fallback = await system_diagnostics_service._query_template_count(db=None)
  assert count_fallback == 11


def test_get_system_diagnostics_endpoint_unauthorized() -> None:
  """GET /api/v1/system/diagnostics without authentication should return 401."""
  response = client.get("/api/v1/system/diagnostics")
  assert response.status_code == 401


def test_get_system_diagnostics_endpoint_authenticated() -> None:
  """GET /api/v1/system/diagnostics should return in-depth diagnostic environment checks for authenticated users."""
  mock_user = MagicMock()
  mock_user.is_admin = False
  main_module.app.dependency_overrides[deps.get_current_user] = lambda: mock_user

  try:
    response = client.get("/api/v1/system/diagnostics")
    assert response.status_code == 200
    data = response.json()
    assert "health" in data
    assert "environment_checks" in data
    assert "troubleshooting_guides" in data
    assert len(data["troubleshooting_guides"]) >= 3
  finally:
    main_module.app.dependency_overrides = {}


def test_trigger_reingest_endpoint_unauthorized() -> None:
  """POST /api/v1/system/reingest without authentication should return 401."""
  response = client.post("/api/v1/system/reingest")
  assert response.status_code == 401


def test_trigger_reingest_endpoint_forbidden_for_non_admin() -> None:
  """POST /api/v1/system/reingest should return 403 for non-admin users."""
  mock_user = MagicMock()
  mock_user.is_admin = False
  mock_user.language_preference = "en"
  main_module.app.dependency_overrides[deps.get_current_user] = lambda: mock_user

  try:
    response = client.post("/api/v1/system/reingest")
    assert response.status_code == 403
    assert "Admin privileges required" in response.json()["detail"]
  finally:
    main_module.app.dependency_overrides = {}


def test_trigger_reingest_endpoint_admin(monkeypatch: pytest.MonkeyPatch) -> None:
  """POST /api/v1/system/reingest should invoke CSV auto-ingestion for admin users."""
  mock_admin = MagicMock()
  mock_admin.is_admin = True
  mock_admin.language_preference = "en"
  main_module.app.dependency_overrides[deps.get_current_user] = lambda: mock_admin

  monkeypatch.setattr("app.api.routers.system.data_ingestion_service.ingest_all_csvs", MagicMock())
  monkeypatch.setattr(
    "app.api.routers.system.duckdb_manager.validate_duckdb_storage",
    MagicMock(return_value={"status": "ready", "tables": {"hospital_data": 1200}}),
  )

  try:
    response = client.post("/api/v1/system/reingest")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "hospital_data" in data["tables"]
  finally:
    main_module.app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_duckdb_catalog_exception_handler() -> None:
  """duckdb_catalog_exception_handler should return structured 404 response."""
  dummy_request = MagicMock()
  exc = duckdb.CatalogException("Table with name missing_table does not exist!")
  res = await main_module.duckdb_catalog_exception_handler(dummy_request, exc)
  assert res.status_code == 404
  body = json.loads(bytes(res.body).decode())
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
  body = json.loads(bytes(res.body).decode())
  assert body["code"] == "DATABASE_ERROR"
  assert "Corrupted file header" in body["detail"]


@pytest.mark.asyncio
async def test_template_seeder_edge_cases(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """TemplateSeeder should handle missing file, empty list, and malformed JSON."""
  nonexistent_file = str(tmp_path / "nonexistent.json")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", nonexistent_file)
  await TemplateSeeder.seed_defaults()
  assert diagnostics_registry.template_status.missing_file is True

  empty_file = tmp_path / "empty.json"
  empty_file.write_text("[]", encoding="utf-8")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", str(empty_file))
  await TemplateSeeder.seed_defaults()
  assert diagnostics_registry.template_status.templates_loaded == 0

  invalid_file = tmp_path / "invalid.json"
  invalid_file.write_text("{broken json", encoding="utf-8")
  monkeypatch.setattr("app.services.template_seeder.DATA_FILE", str(invalid_file))
  await TemplateSeeder.seed_defaults()
  assert any(w.code == "CORRUPTED_TEMPLATE_PACK" for w in diagnostics_registry.warnings)


def test_data_ingestion_edge_cases(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """DataIngestionService should handle missing data directory and ingestion errors."""
  empty_dir = str(tmp_path / "empty_data_dir")
  monkeypatch.setattr("app.services.data_ingestion.DATA_DIR", empty_dir)
  monkeypatch.setattr("app.services.data_ingestion.DEFAULT_CSV_PATH", os.path.join(empty_dir, "hospital_data.csv"))

  DataIngestionService.ingest_all_csvs()
  assert diagnostics_registry.data_status.fallback_generated is True
