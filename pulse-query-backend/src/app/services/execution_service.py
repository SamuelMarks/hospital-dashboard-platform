"""
Execution Service Module.

Encapsulates dashboard and widget query execution, global filter injection,
LRU result caching, HTTP/SQL runner orchestration, and DuckDB cursor management.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import logging
from typing import Any
from uuid import UUID

import duckdb
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.models.dashboard import Dashboard, Widget
from app.schemas.execution import HttpRunnerResultDict, SqlRunnerResultDict
from app.services.cache_service import ResultCacheService, cache_service
from app.services.runners.http import run_http_widget
from app.services.runners.sql import DuckDBCursorProtocol, run_sql_widget
from app.services.sql_utils import process_global_filters

logger = logging.getLogger(__name__)

SqlRunnerCallable = Callable[[DuckDBCursorProtocol, dict[str, Any]], SqlRunnerResultDict | dict[str, Any]]
HttpRunnerCallable = Callable[..., Awaitable[HttpRunnerResultDict | dict[str, Any]]]


class ExecutionService:
  """
  Domain service orchestrating widget and dashboard data refresh operations.
  """

  def extract_token(self, auth_header: str | None) -> str | None:
    """
    Extracts the raw Bearer token string from an HTTP Authorization header.

    Args:
        auth_header (str | None): Raw `Authorization` header value.

    Returns:
        str | None: Extracted token string if valid `Bearer <token>`, else None.
    """
    if auth_header and auth_header.startswith("Bearer "):
      return auth_header.split(" ")[1]
    return None

  def execute_sql_batch(
    self,
    widgets_info: list[tuple[Widget, dict[str, Any], str]],
    results_map: dict[UUID, Any],
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection] = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[Any] = cache_service,
  ) -> None:
    """
    Executes a batch of SQL widgets over a shared DuckDB connection and updates `results_map`.

    Args:
        widgets_info (list[tuple[Widget, dict[str, Any], str]]): Tuples of `(Widget, InjectedConfig, CacheKey)`.
        results_map (dict[UUID, Any]): Mutable dictionary populated with execution results.
        sql_runner_fn (SqlRunnerCallable): SQL runner function.
        conn_factory (Callable[[], duckdb.DuckDBPyConnection]): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[Any]): Result cache service instance.
    """
    active_conn: duckdb.DuckDBPyConnection | None = None
    try:
      active_conn = conn_factory()
      cursor = active_conn.cursor()

      for widget, config, cache_key in widgets_info:
        res = sql_runner_fn(cursor, config)
        results_map[widget.id] = res

        if not res.get("error"):
          cache_svc.set(cache_key, res)

    except Exception as e:
      logger.error(f"DuckDB Execution Error: {e}")
      for widget, _, _ in widgets_info:
        if widget.id not in results_map:
          results_map[widget.id] = {"error": "Internal Database Error"}
    finally:
      if active_conn is not None:
        active_conn.close()

  def _classify_dashboard_widgets(
    self,
    dashboard: Dashboard,
    global_params: dict[str, Any],
    results_map: dict[UUID, Any],
    cache_svc: ResultCacheService[Any],
  ) -> tuple[list[tuple[Widget, dict[str, Any], str]], list[tuple[Widget, dict[str, Any], str]]]:
    """
    Partitions dashboard widgets into cached results, SQL batch queue, and HTTP batch queue.

    Args:
        dashboard (Dashboard): Dashboard with loaded `widgets`.
        global_params (dict[str, Any]): Global filter parameters.
        results_map (dict[UUID, Any]): Output map populated with TEXT and cache-hit results.
        cache_svc (ResultCacheService[Any]): Result cache service instance.

    Returns:
        tuple[list[tuple[Widget, dict[str, Any], str]], list[tuple[Widget, dict[str, Any], str]]]:
            Tuple of `(sql_widgets_to_run, http_widgets_to_run)`.
    """
    sql_widgets_to_run: list[tuple[Widget, dict[str, Any], str]] = []
    http_widgets_to_run: list[tuple[Widget, dict[str, Any], str]] = []

    for widget in dashboard.widgets:
      if widget.type == "TEXT":
        results_map[widget.id] = {"status": "success", "data": None}
        continue

      run_config = widget.config.copy()
      if widget.type == "SQL":
        raw_sql = str(run_config.get("query", ""))
        run_config["query"] = process_global_filters(raw_sql, global_params)

      cache_key = cache_svc.generate_key(widget.type, run_config)
      cached_result = cache_svc.get(cache_key)

      if cached_result:
        results_map[widget.id] = cached_result
      elif widget.type == "SQL":
        sql_widgets_to_run.append((widget, run_config, cache_key))
      elif widget.type == "HTTP":
        http_widgets_to_run.append((widget, run_config, cache_key))
      else:
        results_map[widget.id] = {"error": f"Unknown widget type: {widget.type}"}

    return sql_widgets_to_run, http_widgets_to_run

  async def refresh_dashboard_widgets(
    self,
    dashboard: Dashboard,
    global_params: dict[str, Any],
    authorization: str | None = None,
    http_runner_fn: HttpRunnerCallable = run_http_widget,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection] = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[Any] = cache_service,
  ) -> dict[UUID, Any]:
    """
    Refreshes all widgets belonging to `dashboard` with global filter injection and caching.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with loaded `widgets`.
        global_params (dict[str, Any]): Global filter parameters to inject into SQL queries.
        authorization (str | None): Optional HTTP `Authorization` header for token forwarding.
        http_runner_fn (HttpRunnerCallable): HTTP widget runner callable.
        sql_runner_fn (SqlRunnerCallable): SQL widget runner callable.
        conn_factory (Callable[[], duckdb.DuckDBPyConnection]): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[Any]): Result cache service instance.

    Returns:
        dict[UUID, Any]: Map of widget UUID to execution payload.
    """
    forward_token = self.extract_token(authorization)
    results_map: dict[UUID, Any] = {}

    sql_widgets_to_run, http_widgets_to_run = self._classify_dashboard_widgets(
      dashboard, global_params, results_map, cache_svc
    )

    if http_widgets_to_run:
      tasks = [http_runner_fn(w_info[1], forward_auth_token=forward_token) for w_info in http_widgets_to_run]
      http_results_list = await asyncio.gather(*tasks)

      for (widget, _, cache_key), res in zip(http_widgets_to_run, http_results_list, strict=False):
        results_map[widget.id] = res
        if not res.get("error"):
          cache_svc.set(cache_key, res)

    if sql_widgets_to_run:
      await asyncio.to_thread(
        self.execute_sql_batch,
        sql_widgets_to_run,
        results_map,
        sql_runner_fn,
        conn_factory,
        cache_svc,
      )

    return results_map

  def _execute_single_sql_sync(
    self,
    run_config: dict[str, Any],
    sql_runner_fn: SqlRunnerCallable,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection],
  ) -> dict[str, Any]:
    """
    Synchronously executes a single SQL widget in a worker thread.

    Args:
        run_config (dict[str, Any]): Injected widget configuration dictionary.
        sql_runner_fn (SqlRunnerCallable): SQL runner callable.
        conn_factory (Callable[[], duckdb.DuckDBPyConnection]): DuckDB connection factory.

    Returns:
        dict[str, Any]: Query execution result dictionary.
    """
    active_conn: duckdb.DuckDBPyConnection | None = None
    try:
      active_conn = conn_factory()
      cursor = active_conn.cursor()
      return dict(sql_runner_fn(cursor, run_config))
    except Exception as e:
      return {"error": str(e)}
    finally:
      if active_conn is not None:
        active_conn.close()

  async def refresh_single_widget_result(
    self,
    dashboard: Dashboard,
    widget_id: UUID,
    db: AsyncSession,
    authorization: str | None = None,
    force_refresh: bool = False,
    global_params: dict[str, Any] | None = None,
    http_runner_fn: HttpRunnerCallable = run_http_widget,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection] = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[Any] = cache_service,
  ) -> AppResult[dict[UUID, Any]]:
    """
    Refreshes a single widget belonging to `dashboard`, returning an explicit `AppResult`.

    Args:
        dashboard (Dashboard): Authorized dashboard model.
        widget_id (UUID): Target widget UUID.
        db (AsyncSession): Active PostgreSQL session.
        authorization (str | None): Optional HTTP `Authorization` header.
        force_refresh (bool): Whether to bypass the result cache.
        global_params (dict[str, Any] | None): Optional global filter parameters for SQL widgets.
        http_runner_fn (HttpRunnerCallable): HTTP widget runner callable.
        sql_runner_fn (SqlRunnerCallable): SQL widget runner callable.
        conn_factory (Callable[[], duckdb.DuckDBPyConnection]): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[Any]): Result cache service instance.

    Returns:
        AppResult[dict[UUID, Any]]: `Ok({widget_id: payload})` or `Err(AppError)` if widget not found.
    """
    result = await db.execute(select(Widget).where(Widget.id == widget_id, Widget.dashboard_id == dashboard.id))
    widget = result.scalars().first()

    if not widget:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message="Widget not found",
          status_code=404,
        )
      )

    if widget.type == "TEXT":
      return Ok({widget.id: {"status": "success", "data": None}})

    forward_token = self.extract_token(authorization)
    run_config = widget.config.copy()
    if widget.type == "SQL":
      raw_sql = str(run_config.get("query", ""))
      run_config["query"] = process_global_filters(raw_sql, global_params or {})

    cache_key = cache_svc.generate_key(widget.type, run_config)

    if not force_refresh:
      cached = cache_svc.get(cache_key)
      if cached:
        return Ok({widget.id: cached})

    if widget.type == "SQL":
      res = await asyncio.to_thread(self._execute_single_sql_sync, run_config, sql_runner_fn, conn_factory)
    elif widget.type == "HTTP":
      res = dict(await http_runner_fn(run_config, forward_auth_token=forward_token))
    else:
      res = {"error": f"Unknown widget type: {widget.type}"}

    if not res.get("error"):
      cache_svc.set(cache_key, res)

    return Ok({widget.id: res})


execution_service = ExecutionService()
