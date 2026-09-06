"""
System Health and Diagnostics Router.

Provides API endpoints to query system health, database readiness,
active configuration warnings, and trigger data re-ingestion.
"""

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.diagnostics import check_configuration_hygiene, diagnostics_registry
from app.database.duckdb import duckdb_manager
from app.database.postgres import validate_postgres_connection
from app.schemas.system import (
  ReingestResponse,
  SystemDiagnosticsResponse,
  SystemHealthResponse,
  TroubleshootingStep,
)
from app.services.data_ingestion import data_ingestion_service

router = APIRouter()


@router.get(
  "/health",
  response_model=SystemHealthResponse,
  summary="Check aggregate system health and database readiness",
)
async def get_system_health(
  strict: bool = Query(
    default=False,
    description="If true, returns HTTP 503 when critical components (PostgreSQL/DuckDB) are failing.",
  ),
) -> dict[str, Any]:
  """
  Queries live health states for PostgreSQL, DuckDB, data ingestion, and LLM configuration.

  Args:
      strict (bool): Whether to return HTTP 503 on critical errors.

  Returns:
      dict[str, Any]: Consolidated system health dictionary.

  Raises:
      HTTPException: If strict is True and overall_status is critical.
  """
  # Refresh configuration checks
  check_configuration_hygiene(settings)

  # Check live connection states
  await validate_postgres_connection(raise_on_error=False)
  duckdb_manager.validate_duckdb_storage()

  summary = diagnostics_registry.get_summary()

  if strict and summary.get("overall_status") == "critical":
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=summary,
    )

  return summary


@router.get(
  "/diagnostics",
  response_model=SystemDiagnosticsResponse,
  summary="Detailed system diagnostics and troubleshooting guides",
)
async def get_system_diagnostics() -> dict[str, Any]:
  """
  Provides in-depth diagnostics, environment checks, and actionable troubleshooting guides.

  Returns:
      dict[str, Any]: Detailed diagnostic summary with copyable fix commands.
  """
  # Ensure fresh health status
  await validate_postgres_connection(raise_on_error=False)
  duckdb_manager.validate_duckdb_storage()
  check_configuration_hygiene(settings)

  health_summary = diagnostics_registry.get_summary()

  # Calculate data directory path
  data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data"))
  data_files = [f for f in os.listdir(data_dir) if f.endswith(".csv")] if os.path.exists(data_dir) else []

  environment_checks: dict[str, Any] = {
    "postgres_server": settings.POSTGRES_SERVER,
    "postgres_port": settings.POSTGRES_PORT,
    "postgres_database": settings.POSTGRES_DB,
    "postgres_user": settings.POSTGRES_USER,
    "duckdb_path": settings.DUCKDB_PATH,
    "data_directory": data_dir,
    "data_directory_exists": os.path.exists(data_dir),
    "detected_csv_files": data_files,
    "secret_key_is_default": settings.SECRET_KEY == "CHANGEME_IN_PROD_SUPER_SECRET_KEY",
    "configured_llm_providers": [item["provider"] for item in settings.LLM_SWARM],
  }

  troubleshooting_guides: list[dict[str, Any]] = [
    TroubleshootingStep(
      title="Start PostgreSQL Database Container",
      command="docker compose up -d postgres",
      description="Starts the local PostgreSQL container using Docker Compose with standard default credentials.",
    ).model_dump(),
    TroubleshootingStep(
      title="Verify PostgreSQL Accessibility",
      command=f"pg_isready -h {settings.POSTGRES_SERVER} -p {settings.POSTGRES_PORT} -U {settings.POSTGRES_USER}",
      description="Tests network connectivity and readiness of the PostgreSQL server instance.",
    ).model_dump(),
    TroubleshootingStep(
      title="Ingest Default Clinical Hospital Data",
      command="python scripts/ingest.py",
      description="Loads all CSV datasets from pulse-query-backend/data/ into the DuckDB OLAP database.",
    ).model_dump(),
    TroubleshootingStep(
      title="Start Backend Development Server",
      command="cd pulse-query-backend && uvicorn app.main:app --reload",
      description="Spins up the FastAPI backend application with live hot-reloading.",
    ).model_dump(),
  ]

  return {
    "health": health_summary,
    "environment_checks": environment_checks,
    "troubleshooting_guides": troubleshooting_guides,
  }


@router.post(
  "/reingest",
  response_model=ReingestResponse,
  summary="Trigger manual CSV re-ingestion into DuckDB",
)
def trigger_reingest() -> dict[str, Any]:
  """
  Forces reload of all CSV datasets from the data folder into DuckDB tables.

  Returns:
      dict[str, Any]: ReingestResponse with updated table row counts.
  """
  data_ingestion_service.ingest_all_csvs()
  storage_status = duckdb_manager.validate_duckdb_storage()

  tables = storage_status.get("tables", {})
  return {
    "success": storage_status.get("status") != "error",
    "message": f"Ingestion completed. {len(tables)} tables indexed.",
    "tables": tables,
  }
