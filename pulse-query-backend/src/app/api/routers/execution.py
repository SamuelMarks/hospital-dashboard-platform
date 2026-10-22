"""
Execution Router Module.

Orchestrates dashboard and single-widget refreshment with global filter injection.
"""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.routers.dashboards import get_dashboard_with_access
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.user import User
from app.services.cache_service import cache_service
from app.services.execution_service import execution_service
from app.services.runners.http import run_http_widget
from app.services.runners.sql import run_sql_widget

router = APIRouter()


@router.post("/{dashboard_id}/refresh", response_model=dict[UUID, Any])
async def refresh_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  global_params: dict[str, Any] = Body(default={}),
) -> dict[UUID, Any]:
  """
  Refreshes data for ALL widgets in a specific dashboard.
  Injects `global_params` into SQL queries before execution.

  Args:
      dashboard_id (UUID): ID of the target dashboard to refresh.
      current_user (User): Authenticated user requesting the refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (str | None): Authorization header for token forwarding.
      accept_language (str | None): Preferred response language header.
      global_params (dict[str, Any]): Global filter parameters for queries.

  Returns:
      dict[UUID, Any]: Map of widget UUID to execution results.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  return await execution_service.refresh_dashboard_widgets(
    dashboard=dashboard,
    global_params=global_params,
    authorization=authorization,
    http_runner_fn=run_http_widget,
    sql_runner_fn=run_sql_widget,
    conn_factory=duckdb_manager.get_readonly_connection,
    cache_svc=cache_service,
  )


@router.post("/{dashboard_id}/widgets/{widget_id}/refresh", response_model=dict[UUID, Any])
async def refresh_widget(
  dashboard_id: UUID,
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  force_refresh: bool = False,
  global_params: dict[str, Any] | None = Body(default=None),
) -> dict[UUID, Any]:
  """
  Refreshes data for a SINGLE widget.
  Supports `?force_refresh=true` to bypass cache and optional `global_params` body.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      widget_id (UUID): Target widget ID within the dashboard.
      current_user (User): Authenticated user requesting refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (str | None): Optional authorization header for forwarding.
      accept_language (str | None): Preferred response language header.
      force_refresh (bool): Whether to bypass query cache.
      global_params (dict[str, Any] | None): Optional global filter parameters.

  Returns:
      dict[UUID, Any]: Dictionary mapping widget ID to query execution payload.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  res = await execution_service.refresh_single_widget_result(
    dashboard=dashboard,
    widget_id=widget_id,
    db=db,
    authorization=authorization,
    force_refresh=force_refresh,
    global_params=global_params,
    http_runner_fn=run_http_widget,
    sql_runner_fn=run_sql_widget,
    conn_factory=duckdb_manager.get_readonly_connection,
    cache_svc=cache_service,
  )
  return unwrap_or_raise_http(res)
