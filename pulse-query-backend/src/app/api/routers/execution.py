"""
Execution Router Module.

Orchestrates dashboard and single-widget refreshment with global filter injection.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.deps import get_dashboard_with_access
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.execution import WidgetExecutionPayload, WidgetRefreshRequest
from app.schemas.json_types import JsonObject
from app.services.cache_service import WidgetCachePayload, cache_service
from app.services.execution_service import execution_service
from app.services.runners.http import run_http_widget
from app.services.runners.sql import run_sql_widget

router = APIRouter()


@router.post("/{dashboard_id}/refresh", response_model=dict[UUID, WidgetExecutionPayload])
async def refresh_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  global_params: JsonObject = Body(default={}),
) -> dict[UUID, WidgetCachePayload]:
  """
  Refreshes data for ALL widgets in a specific dashboard.
  Injects `global_params` into SQL queries before execution.

  Args:
      dashboard_id (UUID): ID of the target dashboard to refresh.
      current_user (User): Authenticated user requesting the refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (str | None): Authorization header for token forwarding.
      accept_language (str | None): Preferred response language header.
      global_params (JsonObject): Global filter parameters for queries.

  Returns:
      dict[UUID, WidgetCachePayload]: Map of widget UUID to execution results.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  res = await execution_service.refresh_dashboard_widgets(
    dashboard=dashboard,
    global_params=global_params,
    authorization=authorization,
    http_runner_fn=run_http_widget,
    sql_runner_fn=run_sql_widget,
    conn_factory=duckdb_manager.get_readonly_connection,
    cache_svc=cache_service,
  )
  return unwrap_or_raise_http(res)


@router.post("/{dashboard_id}/widgets/{widget_id}/refresh", response_model=dict[UUID, WidgetExecutionPayload])
async def refresh_widget(
  dashboard_id: UUID,
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  force_refresh: bool = False,
  natural_text: str | None = None,
  processor: str | None = None,
  refresh_request: WidgetRefreshRequest | None = Body(default=None),
) -> dict[UUID, WidgetCachePayload]:
  """
  Refreshes data for a SINGLE widget.
  Supports `?force_refresh=true` to bypass cache, optional `natural_text` and `processor`
  (either as query params or inside `WidgetRefreshRequest`), and optional global filter parameters.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      widget_id (UUID): Target widget ID within the dashboard.
      current_user (User): Authenticated user requesting refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (str | None): Optional authorization header for forwarding.
      accept_language (str | None): Preferred response language header.
      force_refresh (bool): Whether to bypass query cache.
      natural_text (str | None): Optional user-entered natural text or SQL query.
      processor (str | None): Optional processor override (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
      refresh_request (WidgetRefreshRequest | None): Optional strongly typed widget refresh request body.

  Returns:
      dict[UUID, WidgetCachePayload]: Dictionary mapping widget ID to query execution payload.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  cleaned_params = refresh_request.to_filter_params() if refresh_request is not None else None
  effective_natural_text = (
    natural_text if natural_text is not None else (refresh_request.natural_text if refresh_request is not None else None)
  )
  effective_processor = (
    processor if processor is not None else (refresh_request.processor if refresh_request is not None else None)
  )

  res = await execution_service.refresh_single_widget_result(
    dashboard=dashboard,
    widget_id=widget_id,
    db=db,
    authorization=authorization,
    force_refresh=force_refresh,
    global_params=cleaned_params,
    natural_text=effective_natural_text,
    processor=effective_processor,
    http_runner_fn=run_http_widget,
    sql_runner_fn=run_sql_widget,
    conn_factory=duckdb_manager.get_readonly_connection,
    cache_svc=cache_service,
  )
  return unwrap_or_raise_http(res)
