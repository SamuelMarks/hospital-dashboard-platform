"""
Execution Router Module.

Orchestrates dashboard refreshment.
**Update**: Handles `global_filters` query parameter to inject context.
"""

import asyncio
import logging
from typing import Annotated, Any, Dict, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.routers.dashboards import get_dashboard_with_access
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.services.cache_service import cache_service
from app.services.runners.http import run_http_widget
from app.services.runners.sql import run_sql_widget
from app.services.sql_generator import sql_generator

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{dashboard_id}/refresh", response_model=dict[UUID, Any])
async def refresh_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  # New: Accept arbitrary JSON body for params
  global_params: dict[str, Any] = Body(default={}),
) -> dict[UUID, Any]:
  """
  Refreshes data for ALL widgets in a specific dashboard.
  Injects global_params into SQL queries before execution.

  Args:
      dashboard_id (UUID): ID of the target dashboard to refresh.
      current_user (User): Authenticated user requesting the refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (Optional[str]): Authorization header for token forwarding.
      accept_language (Optional[str]): Preferred response language header.
      global_params (dict[str, Any]): Global filter parameters for queries.

  Returns:
      dict[UUID, Any]: Map of widget UUID to execution results.

  Raises:
      HTTPException: 404 if dashboard not found or user lacks access.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  forward_token = _extract_token(authorization)
  results_map: dict[UUID, Any] = {}

  sql_widgets_to_run: list[tuple[Widget, dict[str, Any], str]] = []
  http_widgets_to_run: list[tuple[Widget, dict[str, Any], str]] = []

  for widget in dashboard.widgets:
    # Skip processing for Static Text widgets immediately
    if widget.type == "TEXT":
      results_map[widget.id] = {"status": "success", "data": None}
      continue

    # Pre-process Config to inject Globals
    # We create a COPY of the config so we don't mutate the DB object
    run_config = widget.config.copy()

    if widget.type == "SQL":
      raw_sql = run_config.get("query", "")
      # Inject Globals
      run_config["query"] = sql_generator.process_global_filters(raw_sql, global_params)

    # Generate Cache Key (using the *injected* query/config)
    # This ensures filtering creates unique cache entries
    cache_key = cache_service.generate_key(widget.type, run_config)

    cached_result = cache_service.get(cache_key)

    if cached_result:
      results_map[widget.id] = cached_result
    else:
      if widget.type == "SQL":
        sql_widgets_to_run.append((widget, run_config, cache_key))  # Pass explicit config
      elif widget.type == "HTTP":
        http_widgets_to_run.append((widget, run_config, cache_key))
      else:
        results_map[widget.id] = {"error": f"Unknown widget type: {widget.type}"}

  # Execute HTTP
  if http_widgets_to_run:
    # Extract run_config from tuple (widget, config, key)
    tasks = [run_http_widget(w_info[1], forward_auth_token=forward_token) for w_info in http_widgets_to_run]
    http_results_list = await asyncio.gather(*tasks)

    for (widget, _, cache_key), res in zip(http_widgets_to_run, http_results_list):
      results_map[widget.id] = res
      if not res.get("error"):
        cache_service.set(cache_key, res)

  # Execute SQL
  if sql_widgets_to_run:
    _execute_sql_batch(sql_widgets_to_run, results_map)

  return results_map


@router.post("/{dashboard_id}/widgets/{widget_id}/refresh", response_model=dict[UUID, Any])
async def refresh_widget(
  dashboard_id: UUID,
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
  force_refresh: bool = False,
) -> dict[UUID, Any]:
  """
  Refreshes data for a SINGLE widget.
  Supports ?force_refresh=true to bypass cache.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      widget_id (UUID): Target widget ID within the dashboard.
      current_user (User): Authenticated user requesting refresh.
      db (AsyncSession): PostgreSQL async database session.
      authorization (Optional[str]): Optional authorization header for forwarding.
      accept_language (Optional[str]): Preferred response language header.
      force_refresh (bool): Whether to bypass query cache.

  Returns:
      dict[UUID, Any]: Dictionary mapping widget ID to query execution payload.

  Raises:
      HTTPException: 404 if dashboard or widget not found or access denied.
  """
  dashboard, _ = await get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  # 1. Fetch Widget ensuring it belongs to authorized dashboard
  result = await db.execute(select(Widget).where(Widget.id == widget_id, Widget.dashboard_id == dashboard.id))
  widget = result.scalars().first()

  if not widget:
    raise HTTPException(status_code=404, detail="Widget not found")

  # Optimization: Return immediately for TEXT widgets
  if widget.type == "TEXT":
    return {widget.id: {"status": "success", "data": None}}

  forward_token = _extract_token(authorization)

  # 2. Prepare Execution
  run_config = widget.config.copy()
  cache_key = cache_service.generate_key(widget.type, run_config)

  # 3. Check Cache (unless forced)
  if not force_refresh:
    cached = cache_service.get(cache_key)
    if cached:
      return {widget.id: cached}

  # 4. Execute
  res = {"error": "Execution failed"}

  if widget.type == "SQL":
    conn = None
    try:
      conn = duckdb_manager.get_readonly_connection()
      cursor = conn.cursor()
      res = run_sql_widget(cursor, run_config)
    except Exception as e:
      res = {"error": str(e)}
    finally:
      if conn:
        conn.close()
  elif widget.type == "HTTP":
    res = await run_http_widget(run_config, forward_auth_token=forward_token)
  else:
    res = {"error": f"Unknown widget type: {widget.type}"}

  # 5. Cache and Return
  if not res.get("error"):
    cache_service.set(cache_key, res)

  return {widget.id: res}


def _extract_token(auth_header: str | None) -> str | None:
  """
  Extract bearer token from Authorization header if present.

  Args:
      auth_header (Optional[str]): Raw Authorization header value.

  Returns:
      Optional[str]: Extracted token string, or None if not present/invalid.
  """
  if auth_header and auth_header.startswith("Bearer "):
    return auth_header.split(" ")[1]
  return None


def _execute_sql_batch(widgets_info: list[tuple[Widget, dict[str, Any], str]], results_map: dict[UUID, Any]) -> None:
  """
  Helper to run SQL widgets over a single DuckDB connection.

  Args:
      widgets_info (list[tuple[Widget, dict[str, Any], str]]): Tuples of (Widget, InjectedConfig, CacheKey).
      results_map (dict[UUID, Any]): Mutable dictionary to populate with execution results.

  Returns:
      None
  """
  try:
    conn = duckdb_manager.get_readonly_connection()
    cursor = conn.cursor()

    for widget, config, cache_key in widgets_info:
      res = run_sql_widget(cursor, config)
      results_map[widget.id] = res

      if not res.get("error"):
        cache_service.set(cache_key, res)

  except Exception as e:
    logger.error(f"DuckDB Execution Error: {e}")
    for widget, _, _ in widgets_info:
      if widget.id not in results_map:
        results_map[widget.id] = {"error": "Internal Database Error"}
  finally:
    if "conn" in locals():
      conn.close()
