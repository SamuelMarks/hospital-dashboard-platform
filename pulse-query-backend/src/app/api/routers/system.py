"""
System Health and Diagnostics Router.

Provides API endpoints to query system health, database readiness,
active configuration warnings, and trigger data re-ingestion.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api import deps
from app.api.routers.admin import require_admin
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
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

logger = logging.getLogger(__name__)
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

  summary = unwrap_or_raise_http(await system_diagnostics_service.get_health_summary_result(require_populated=strict))

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
  logger.debug(f"Fetching system diagnostics for user={current_user.id}")
  response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  response.headers["Pragma"] = "no-cache"
  response.headers["Expires"] = "0"
  return unwrap_or_raise_http(await system_diagnostics_service.build_diagnostics_response_result())


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
  logger.debug(f"Triggering manual DuckDB CSV re-ingestion for admin={current_user.id}")
  return unwrap_or_raise_http(
    await system_diagnostics_service.run_reingest_result(
      ingestion_svc=data_ingestion_service,
      duck_mgr=duckdb_manager,
    )
  )


__all__ = [
  "_inspect_data_directory",
  "data_ingestion_service",
  "duckdb_manager",
  "get_system_diagnostics",
  "get_system_health",
  "router",
  "trigger_reingest",
]
