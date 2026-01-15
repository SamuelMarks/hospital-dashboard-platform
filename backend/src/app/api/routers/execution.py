"""
Execution Router Module.

Orchestrates dashboard refreshment.
**Update**: Handles `global_filters` query parameter to inject context.
"""

import asyncio
import logging
from typing import Dict, Any, List, Annotated, Tuple, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.database.postgres import get_db
from app.database.duckdb import duckdb_manager
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.services.runners.http import run_http_widget
from app.services.runners.sql import run_sql_widget
from app.services.cache_service import cache_service
from app.services.sql_generator import sql_generator  # New Import

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{dashboard_id}/refresh", response_model=Dict[UUID, Any])
async def refresh_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  # New: Accept arbitrary JSON body for params
  global_params: Dict[str, Any] = Body(default={}),
) -> Dict[UUID, Any]:
  """
  Refreshes data for ALL widgets in a specific dashboard.
  Injects global_params into SQL queries before execution.
  """
  result = await db.execute(
    select(Dashboard)
    .where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id)
    .options(selectinload(Dashboard.widgets))
  )
  dashboard = result.scalars().first()

  if not dashboard:
    raise HTTPException(status_code=404, detail="Dashboard not found")

  forward_token = _extract_token(authorization)
  results_map: Dict[UUID, Any] = {}

  sql_widgets_to_run: List[Tuple[Widget, str]] = []
  http_widgets_to_run: List[Tuple[Widget, str]] = []

  for widget in dashboard.widgets:
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


@router.post("/{dashboard_id}/widgets/{widget_id}/refresh", response_model=Dict[UUID, Any])
async def refresh_widget(
  dashboard_id: UUID,
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  authorization: Annotated[str | None, Header()] = None,
  force_refresh: bool = False,
) -> Dict[UUID, Any]:
  """
  Refreshes data for a SINGLE widget.
  Supports ?force_refresh=true to bypass cache.
  """
  # 1. Fetch Widget with Ownership Check
  result = await db.execute(
    select(Widget)
    .join(Dashboard)
    .where(Widget.id == widget_id, Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id)
  )
  widget = result.scalars().first()

  if not widget:
    raise HTTPException(status_code=404, detail="Widget not found")

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
    try:
      conn = duckdb_manager.get_readonly_connection()
      cursor = conn.cursor()
      res = run_sql_widget(cursor, run_config)
      conn.close()
    except Exception as e:
      res = {"error": str(e)}
  elif widget.type == "HTTP":
    res = await run_http_widget(run_config, forward_auth_token=forward_token)
  else:
    res = {"error": f"Unknown widget type: {widget.type}"}

  # 5. Cache and Return
  if not res.get("error"):
    cache_service.set(cache_key, res)

  return {widget.id: res}


def _extract_token(auth_header: str | None) -> str | None:
  if auth_header and auth_header.startswith("Bearer "):
    return auth_header.split(" ")[1]
  return None


def _execute_sql_batch(widgets_info: List[Tuple[Widget, Dict[str, Any], str]], results_map: Dict[UUID, Any]):
  """
  Helper to run SQL widgets over a single DuckDB connection.
  Accepts (Widget, InjectedConfig, CacheKey).
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
