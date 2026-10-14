"""
System Health and Diagnostics Router.

Provides API endpoints to query system health, database readiness,
active configuration warnings, and trigger data re-ingestion.
"""

import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api import deps
from app.api.routers.admin import require_admin
from app.core.config import settings
from app.core.diagnostics import check_configuration_hygiene, diagnostics_registry
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.database.postgres import validate_postgres_connection
from app.models.user import User
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
) -> SystemHealthResponse:
  """
  Queries live health states for PostgreSQL, DuckDB, data ingestion, and LLM configuration.

  Args:
      strict (bool): Whether to return HTTP 503 on critical errors.

  Returns:
      SystemHealthResponse: Consolidated system health model.

  Raises:
      HTTPException: If strict is True and overall_status is critical.
  """
  # Refresh configuration checks
  check_configuration_hygiene(settings)

  # Check live connection states
  await validate_postgres_connection(raise_on_error=False)
  await run_in_duckdb_thread(duckdb_manager.validate_duckdb_storage)

  summary = diagnostics_registry.get_summary()

  if strict and summary.get("overall_status") == "critical":
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=summary,
    )

  return SystemHealthResponse.model_validate(summary)


def _inspect_data_directory() -> tuple[str, bool, list[str]]:
  """
  Inspects the local `data` directory on disk and lists available `.csv` files.

  Returns:
      tuple[str, bool, list[str]]: Tuple of `(data_dir_path, exists_flag, csv_filenames)`.
  """
  data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data"))
  exists = os.path.exists(data_dir)
  data_files = [f for f in os.listdir(data_dir) if f.endswith(".csv")] if exists else []
  return data_dir, exists, data_files


@router.get(
  "/diagnostics",
  response_model=SystemDiagnosticsResponse,
  summary="Detailed system diagnostics and troubleshooting guides",
)
async def get_system_diagnostics(
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> SystemDiagnosticsResponse:
  """
  Provides in-depth diagnostics, environment checks, and actionable troubleshooting guides.
  Requires an authenticated user session.

  Args:
      current_user (User): The authenticated user making the request.

  Returns:
      SystemDiagnosticsResponse: Detailed diagnostic summary with copyable fix commands.
  """
  # Ensure fresh health status
  await validate_postgres_connection(raise_on_error=False)
  await run_in_duckdb_thread(duckdb_manager.validate_duckdb_storage)
  check_configuration_hygiene(settings)

  health_summary = SystemHealthResponse.model_validate(diagnostics_registry.get_summary())
  data_dir, data_dir_exists, data_files = _inspect_data_directory()

  environment_checks: dict[str, Any] = {
    "postgres_server": settings.POSTGRES_SERVER,
    "postgres_port": settings.POSTGRES_PORT,
    "postgres_database": settings.POSTGRES_DB,
    "postgres_user": settings.POSTGRES_USER,
    "duckdb_path": settings.DUCKDB_PATH,
    "data_directory": data_dir,
    "data_directory_exists": data_dir_exists,
    "detected_csv_files": data_files,
    "secret_key_is_default": settings.SECRET_KEY == "CHANGEME_IN_PROD_SUPER_SECRET_KEY",
    "configured_llm_providers": [item["provider"] for item in settings.LLM_SWARM],
  }

  troubleshooting_guides: list[TroubleshootingStep] = [
    TroubleshootingStep(
      title="Start PostgreSQL Database Container",
      command="docker compose up -d postgres",
      description="Starts the local PostgreSQL container using Docker Compose with standard default credentials.",
    ),
    TroubleshootingStep(
      title="Verify PostgreSQL Accessibility",
      command=f"pg_isready -h {settings.POSTGRES_SERVER} -p {settings.POSTGRES_PORT} -U {settings.POSTGRES_USER}",
      description="Tests network connectivity and readiness of the PostgreSQL server instance.",
    ),
    TroubleshootingStep(
      title="Ingest Default Clinical Hospital Data",
      command="python scripts/ingest.py",
      description="Loads all CSV datasets from pulse-query-backend/data/ into the DuckDB OLAP database.",
    ),
    TroubleshootingStep(
      title="Start Backend Development Server",
      command="cd pulse-query-backend && uvicorn app.main:app --reload",
      description="Spins up the FastAPI backend application with live hot-reloading.",
    ),
  ]

  return SystemDiagnosticsResponse(
    health=health_summary,
    environment_checks=environment_checks,
    troubleshooting_guides=troubleshooting_guides,
  )


@router.post(
  "/reingest",
  response_model=ReingestResponse,
  summary="Trigger manual CSV re-ingestion into DuckDB",
)
async def trigger_reingest(
  current_user: Annotated[User, Depends(require_admin)],
) -> ReingestResponse:
  """
  Forces reload of all CSV datasets from the data folder into DuckDB tables.
  Requires administrative privileges.

  Args:
      current_user (User): The authenticated administrative user.

  Returns:
      ReingestResponse: ReingestResponse with updated table row counts.
  """
  await run_in_duckdb_thread(data_ingestion_service.ingest_all_csvs)
  storage_status = await run_in_duckdb_thread(duckdb_manager.validate_duckdb_storage)

  tables = storage_status.get("tables", {})
  return ReingestResponse(
    success=storage_status.get("status") != "error",
    message=f"Ingestion completed. {len(tables)} tables indexed.",
    tables=tables,
  )
