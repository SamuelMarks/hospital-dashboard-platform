"""
System Health and Diagnostics Router.

Provides API endpoints to query system health, database readiness,
active configuration warnings, and trigger data re-ingestion.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api import deps
from app.api.routers.admin import require_admin
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.models.user import User
from app.schemas.system import (
  ReingestResponse,
  SystemDiagnosticsResponse,
  SystemHealthResponse,
)
from app.services.data_ingestion import data_ingestion_service
from app.services.system_service import (
  inspect_data_directory as _inspect_data_directory,
  system_diagnostics_service,
)

router = APIRouter()


@router.get(
  "/health",
  response_model=SystemHealthResponse,
  summary="Check aggregate system health and database readiness",
)
async def get_system_health(
  response: Response,
  strict: bool = Query(
    default=True,
    description="If true, requires clinical datasets and templates to be populated.",
  ),
) -> SystemHealthResponse:
  """
  Queries live health states for PostgreSQL, DuckDB, data ingestion, templates, and LLM configuration.
  Returns HTTP 503 Service Unavailable with the full SystemHealthResponse payload whenever
  `summary.status != "healthy"`.

  Args:
      response (Response): FastAPI response object for setting status code 503 when unhealthy.
      strict (bool): Whether to require populated datasets and templates.

  Returns:
      SystemHealthResponse: Consolidated system health model.
  """
  response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  response.headers["Pragma"] = "no-cache"
  response.headers["Expires"] = "0"

  summary = await system_diagnostics_service.get_health_summary(require_populated=strict)

  if summary.status != "healthy":
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

  return summary


@router.get(
  "/diagnostics",
  response_model=SystemDiagnosticsResponse,
  summary="Detailed system diagnostics and troubleshooting guides",
)
async def get_system_diagnostics(
  response: Response,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> SystemDiagnosticsResponse:
  """
  Provides in-depth diagnostics, environment checks, and actionable troubleshooting guides.
  Requires an authenticated user session.

  Args:
      response (Response): FastAPI response object for setting no-store cache headers.
      current_user (User): The authenticated user making the request.

  Returns:
      SystemDiagnosticsResponse: Detailed diagnostic summary with copyable fix commands.
  """
  _ = current_user
  response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  response.headers["Pragma"] = "no-cache"
  response.headers["Expires"] = "0"
  return await system_diagnostics_service.build_diagnostics_response()


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
  _ = current_user
  await run_in_duckdb_thread(data_ingestion_service.ingest_all_csvs)
  storage_status = await run_in_duckdb_thread(duckdb_manager.validate_duckdb_storage)

  tables = storage_status.get("tables", {})
  return ReingestResponse(
    success=storage_status.get("status") != "error",
    message=f"Ingestion completed. {len(tables)} tables indexed.",
    tables=tables,
  )


__all__ = [
  "_inspect_data_directory",
  "get_system_diagnostics",
  "get_system_health",
  "router",
  "trigger_reingest",
]
