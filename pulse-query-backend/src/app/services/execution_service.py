"""
Execution Service Module.

Encapsulates dashboard and widget query execution, global filter injection,
LRU result caching, HTTP/SQL runner orchestration, and DuckDB cursor management.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
import contextlib
import logging
from typing import Protocol, TypeGuard
from uuid import UUID

import duckdb
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.models.dashboard import Dashboard, Widget
from app.schemas.execution import (
  HttpRunnerResultDict,
  ResolvedSqlQuery,
  SqlRunnerResultDict,
  TextWidgetExecutionResult,
  WidgetExecutionErrorResult,
  WidgetTypeLiteral,
)
from app.schemas.json_types import JsonObject, JsonValue
from app.schemas.widget import is_valid_processor_identifier, parse_sql_config_lenient
from app.services.cache_service import ResultCacheService, WidgetCachePayload, cache_service
from app.services.runners.http import run_http_widget
from app.services.runners.sql import DuckDBCursorProtocol, run_sql_widget, validate_query_ast_result
from app.services.sql_generator import sql_generator
from app.services.sql_utils import process_global_filters

logger = logging.getLogger(__name__)


def is_supported_widget_type(widget_type: str) -> TypeGuard[WidgetTypeLiteral]:
  """
  Checks whether `widget_type` is a valid `WidgetTypeLiteral` (`'SQL'`, `'HTTP'`, or `'TEXT'`).

  Args:
      widget_type (str): Raw widget type string.

  Returns:
      TypeGuard[WidgetTypeLiteral]: True if `widget_type` is `'SQL'`, `'HTTP'`, or `'TEXT'`.
  """
  return widget_type in ("SQL", "HTTP", "TEXT")


class DuckDBCursorFactoryProtocol(Protocol):
  """
  Structural protocol representing a DuckDB connection or test proxy providing `.cursor()` and `.close()`.
  """

  def cursor(self) -> DuckDBCursorProtocol:
    """Returns a DuckDB cursor instance."""

  def close(self) -> None:
    """Closes the connection."""


SqlRunnerCallable = Callable[[DuckDBCursorProtocol, Mapping[str, JsonValue]], SqlRunnerResultDict | JsonObject]
HttpRunnerCallable = Callable[..., Awaitable[HttpRunnerResultDict | JsonObject]]
ConnFactoryCallable = Callable[[], DuckDBCursorFactoryProtocol | duckdb.DuckDBPyConnection]


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
    widgets_info: list[tuple[Widget, JsonObject, str]],
    results_map: dict[UUID, WidgetCachePayload],
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: ConnFactoryCallable = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[WidgetCachePayload] = cache_service,
  ) -> None:
    """
    Executes a batch of SQL widgets over a shared DuckDB connection and updates `results_map`.

    Args:
        widgets_info (list[tuple[Widget, JsonObject, str]]): Tuples of `(Widget, InjectedConfig, CacheKey)`.
        results_map (dict[UUID, WidgetCachePayload]): Mutable dictionary populated with execution results.
        sql_runner_fn (SqlRunnerCallable): SQL runner function.
        conn_factory (ConnFactoryCallable): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[WidgetCachePayload]): Result cache service instance.
    """
    with duckdb_manager._write_lock:
      try:
        with contextlib.closing(conn_factory()) as active_conn:
          cursor = active_conn.cursor()

          for widget, config, cache_key in widgets_info:
            res = sql_runner_fn(cursor, config)
            results_map[widget.id] = res

            if not res.get("error"):
              cache_svc.set(cache_key, res)

      except (duckdb.Error, RuntimeError, ValueError, TypeError, OSError) as e:
        logger.error(f"DuckDB Execution Error: {e}")
        for widget, _, _ in widgets_info:
          if widget.id not in results_map:
            results_map[widget.id] = {"error": "Internal Database Error"}

  def _classify_dashboard_widgets(
    self,
    dashboard: Dashboard,
    global_params: Mapping[str, JsonValue],
    results_map: dict[UUID, WidgetCachePayload],
    cache_svc: ResultCacheService[WidgetCachePayload],
  ) -> tuple[list[tuple[Widget, JsonObject, str]], list[tuple[Widget, JsonObject, str]]]:
    """
    Partitions dashboard widgets into cached results, SQL batch queue, and HTTP batch queue.

    Args:
        dashboard (Dashboard): Dashboard with loaded `widgets`.
        global_params (Mapping[str, JsonValue]): Global filter parameters.
        results_map (dict[UUID, WidgetCachePayload]): Output map populated with TEXT and cache-hit results.
        cache_svc (ResultCacheService[WidgetCachePayload]): Result cache service instance.

    Returns:
        tuple[list[tuple[Widget, JsonObject, str]], list[tuple[Widget, JsonObject, str]]]:
            Tuple of `(sql_widgets_to_run, http_widgets_to_run)`.
    """
    sql_widgets_to_run: list[tuple[Widget, JsonObject, str]] = []
    http_widgets_to_run: list[tuple[Widget, JsonObject, str]] = []

    for widget in dashboard.widgets:
      if not is_supported_widget_type(widget.type):
        results_map[widget.id] = WidgetExecutionErrorResult(error=f"Unknown widget type: {widget.type}").model_dump(
          exclude_none=True
        )
        continue

      if widget.type == "TEXT":
        results_map[widget.id] = TextWidgetExecutionResult().model_dump()
        continue

      run_config: JsonObject = widget.config.copy()
      if widget.type == "SQL":
        parsed_sql = parse_sql_config_lenient(run_config)
        run_config["query"] = process_global_filters(parsed_sql.query or "", global_params)

      cache_key = cache_svc.generate_key(widget.type, run_config)
      cached_result = cache_svc.get(cache_key)

      if cached_result:
        results_map[widget.id] = cached_result
      elif widget.type == "SQL":
        sql_widgets_to_run.append((widget, run_config, cache_key))
      else:
        http_widgets_to_run.append((widget, run_config, cache_key))

    return sql_widgets_to_run, http_widgets_to_run

  async def refresh_dashboard_widgets(
    self,
    dashboard: Dashboard,
    global_params: Mapping[str, JsonValue],
    authorization: str | None = None,
    http_runner_fn: HttpRunnerCallable = run_http_widget,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: ConnFactoryCallable = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[WidgetCachePayload] = cache_service,
  ) -> AppResult[dict[UUID, WidgetCachePayload]]:
    """
    Refreshes all widgets belonging to `dashboard` with global filter injection and caching.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with loaded `widgets`.
        global_params (Mapping[str, JsonValue]): Global filter parameters to inject into SQL queries.
        authorization (str | None): Optional HTTP `Authorization` header for token forwarding.
        http_runner_fn (HttpRunnerCallable): HTTP widget runner callable.
        sql_runner_fn (SqlRunnerCallable): SQL widget runner callable.
        conn_factory (ConnFactoryCallable): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[WidgetCachePayload]): Result cache service instance.

    Returns:
        AppResult[dict[UUID, WidgetCachePayload]]: `Ok(results_map)` mapping widget UUID to execution payload.
    """
    forward_token = self.extract_token(authorization)
    results_map: dict[UUID, WidgetCachePayload] = {}

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

    return Ok(results_map)

  def _execute_single_sql_sync(
    self,
    run_config: JsonObject,
    sql_runner_fn: SqlRunnerCallable,
    conn_factory: ConnFactoryCallable,
  ) -> SqlRunnerResultDict | JsonObject:
    """
    Synchronously executes a single SQL widget in a worker thread.

    Args:
        run_config (JsonObject): Injected widget configuration dictionary.
        sql_runner_fn (SqlRunnerCallable): SQL runner callable.
        conn_factory (ConnFactoryCallable): DuckDB connection factory.

    Returns:
        SqlRunnerResultDict | JsonObject: Query execution result dictionary.
    """
    with duckdb_manager._write_lock:
      try:
        with contextlib.closing(conn_factory()) as active_conn:
          cursor = active_conn.cursor()
          return sql_runner_fn(cursor, run_config)
      except (duckdb.Error, RuntimeError, ValueError, TypeError, OSError) as e:
        return {"error": str(e)}

  async def _resolve_sql_widget_run_config_result(
    self,
    run_config: JsonObject,
    db: AsyncSession,
    global_params: Mapping[str, JsonValue] | None,
    natural_text: str | None,
    processor: str | None,
  ) -> AppResult[ResolvedSqlQuery]:
    """
    Resolves the executable SQL configuration, effective processor, and natural text for a SQL widget.

    Args:
        run_config (JsonObject): Base widget configuration dictionary.
        db (AsyncSession): Active PostgreSQL session.
        global_params (Mapping[str, JsonValue] | None): Global filter parameters.
        natural_text (str | None): Optional user-submitted natural text or SQL override.
        processor (str | None): Optional processor override (`'SQL'` or `<provider>:<model>`).

    Returns:
        AppResult[ResolvedSqlQuery]: `Ok(ResolvedSqlQuery)` or `Err(AppError)`.
    """
    parsed_sql = parse_sql_config_lenient(run_config)
    effective_processor = (processor or parsed_sql.processor).strip()
    if not is_valid_processor_identifier(effective_processor):
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Invalid processor identifier. Expected 'SQL' or '<provider>:<model>'.",
          status_code=400,
        )
      )

    effective_text = (
      natural_text.strip()
      if natural_text is not None and natural_text.strip()
      else (parsed_sql.natural_text_prompt.strip() if parsed_sql.natural_text_prompt else None)
    )
    has_interactive_request = natural_text is not None or processor is not None or parsed_sql.allow_natural_text

    if effective_processor.upper() == "SQL":
      raw_sql = (
        natural_text.strip()
        if natural_text is not None and natural_text.strip()
        else (parsed_sql.query or effective_text or "")
      )
      if has_interactive_request and natural_text is not None:
        ast_check = validate_query_ast_result(raw_sql)
        if isinstance(ast_check, Err):
          return Err(ast_check.error)
      run_config["query"] = process_global_filters(raw_sql, global_params or {})
      run_config["processor"] = "SQL"
      if effective_text is not None:
        run_config["natural_text_prompt"] = effective_text
      return Ok(
        ResolvedSqlQuery(
          run_config=run_config,
          effective_processor="SQL",
          effective_natural_text=effective_text,
        )
      )

    stored_query = (parsed_sql.query or "").strip()
    if natural_text is not None or (not stored_query and effective_text):
      prompt_to_run = natural_text.strip() if natural_text is not None else (effective_text or "")
      gen_res = await sql_generator.generate_sql_for_processor_result(
        prompt=prompt_to_run,
        processor=effective_processor,
        db=db,
      )
      if isinstance(gen_res, Err):
        return Err(gen_res.error)
      generated_sql = gen_res.value
      ast_check = validate_query_ast_result(generated_sql)
      if isinstance(ast_check, Err):
        return Err(ast_check.error)
      run_config["query"] = process_global_filters(generated_sql, global_params or {})
    else:
      run_config["query"] = process_global_filters(stored_query, global_params or {})

    run_config["processor"] = effective_processor
    if effective_text is not None:
      run_config["natural_text_prompt"] = effective_text
    return Ok(
      ResolvedSqlQuery(
        run_config=run_config,
        effective_processor=effective_processor,
        effective_natural_text=effective_text,
      )
    )

  async def _prepare_single_widget_sql_result(
    self,
    widget: Widget,
    run_config: JsonObject,
    db: AsyncSession,
    global_params: Mapping[str, JsonValue] | None,
    natural_text: str | None,
    processor: str | None,
    has_interactive_meta: bool,
  ) -> AppResult[tuple[ResolvedSqlQuery, dict[UUID, WidgetCachePayload] | None]]:
    """
    Prepares `ResolvedSqlQuery` for a single SQL widget execution or returns an early error/result map.

    Args:
        widget (Widget): Target SQL widget ORM instance.
        run_config (JsonObject): Cloned widget config dictionary.
        db (AsyncSession): Active PostgreSQL session.
        global_params (Mapping[str, JsonValue] | None): Global filter parameters.
        natural_text (str | None): Optional user-entered natural text or SQL override.
        processor (str | None): Optional processor override.
        has_interactive_meta (bool): Whether natural-text or processor metadata is active.

    Returns:
        AppResult[tuple[ResolvedSqlQuery, dict[UUID, WidgetCachePayload] | None]]:
            `Ok((resolved_sql_query, early_response))` or `Err(AppError)`.
    """
    parsed_sql = parse_sql_config_lenient(run_config)
    if not has_interactive_meta:
      run_config["query"] = process_global_filters(parsed_sql.query or "", global_params or {})
      return Ok(
        (
          ResolvedSqlQuery(
            run_config=run_config,
            effective_processor="SQL",
            effective_natural_text=None,
          ),
          None,
        )
      )

    resolved_res = await self._resolve_sql_widget_run_config_result(
      run_config=run_config,
      db=db,
      global_params=global_params,
      natural_text=natural_text,
      processor=processor,
    )
    if isinstance(resolved_res, Err):
      if resolved_res.error.code == ErrorCode.VALIDATION_ERROR and processor is not None:
        return Err(resolved_res.error)
      err_model = WidgetExecutionErrorResult(
        data=[],
        columns=[],
        error=resolved_res.error.message,
        generated_sql=None,
        processor_used=(processor or parsed_sql.processor).strip(),
        natural_text=natural_text,
      )
      early_payload: dict[UUID, WidgetCachePayload] = {
        widget.id: err_model.model_dump(),
      }
      return Ok(
        (
          ResolvedSqlQuery(
            run_config=run_config,
            effective_processor="SQL",
            effective_natural_text=natural_text,
          ),
          early_payload,
        )
      )

    return Ok((resolved_res.value, None))

  async def refresh_single_widget_result(
    self,
    dashboard: Dashboard,
    widget_id: UUID,
    db: AsyncSession,
    authorization: str | None = None,
    force_refresh: bool = False,
    global_params: Mapping[str, JsonValue] | None = None,
    natural_text: str | None = None,
    processor: str | None = None,
    http_runner_fn: HttpRunnerCallable = run_http_widget,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    conn_factory: ConnFactoryCallable = duckdb_manager.get_readonly_connection,
    cache_svc: ResultCacheService[WidgetCachePayload] = cache_service,
  ) -> AppResult[dict[UUID, WidgetCachePayload]]:
    """
    Refreshes a single widget belonging to `dashboard`, returning an explicit `AppResult`.

    Args:
        dashboard (Dashboard): Authorized dashboard model.
        widget_id (UUID): Target widget UUID.
        db (AsyncSession): Active PostgreSQL session.
        authorization (str | None): Optional HTTP `Authorization` header.
        force_refresh (bool): Whether to bypass the result cache.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters for SQL widgets.
        natural_text (str | None): Optional user-entered natural language prompt or SQL query.
        processor (str | None): Optional processor override (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
        http_runner_fn (HttpRunnerCallable): HTTP widget runner callable.
        sql_runner_fn (SqlRunnerCallable): SQL widget runner callable.
        conn_factory (ConnFactoryCallable): Connection factory returning a DuckDB connection.
        cache_svc (ResultCacheService[WidgetCachePayload]): Result cache service instance.

    Returns:
        AppResult[dict[UUID, WidgetCachePayload]]: `Ok({widget_id: payload})` or `Err(AppError)` if widget not found.
    """
    result = await db.execute(select(Widget).where(Widget.id == widget_id, Widget.dashboard_id == dashboard.id))
    widget = result.scalars().first()
    if not widget:
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message="Widget not found", status_code=404))

    if widget.type == "TEXT":
      return Ok({widget.id: TextWidgetExecutionResult().model_dump()})

    run_config = widget.config.copy()
    has_interactive_meta = bool(natural_text is not None or processor is not None or run_config.get("allow_natural_text"))
    effective_processor = "SQL"
    effective_text: str | None = None

    if widget.type == "SQL":
      prep_res = await self._prepare_single_widget_sql_result(
        widget, run_config, db, global_params, natural_text, processor, has_interactive_meta
      )
      if isinstance(prep_res, Err):
        return Err(prep_res.error)
      resolved_query, early_resp = prep_res.value
      run_config = resolved_query.run_config
      effective_processor = resolved_query.effective_processor
      effective_text = resolved_query.effective_natural_text
      if early_resp is not None:
        return Ok(early_resp)

    cache_key = cache_svc.generate_key(widget.type, run_config)
    if not force_refresh:
      cached = cache_svc.get(cache_key)
      if cached:
        return Ok({widget.id: cached})

    res = await self._dispatch_single_widget_runner(
      widget.type,
      run_config,
      self.extract_token(authorization),
      has_interactive_meta,
      effective_processor,
      effective_text,
      http_runner_fn,
      sql_runner_fn,
      conn_factory,
    )
    if not res.get("error"):
      cache_svc.set(cache_key, res)
    return Ok({widget.id: res})

  async def _dispatch_single_widget_runner(
    self,
    widget_type: str,
    run_config: JsonObject,
    forward_token: str | None,
    has_interactive_meta: bool,
    effective_processor: str,
    effective_text: str | None,
    http_runner_fn: HttpRunnerCallable,
    sql_runner_fn: SqlRunnerCallable,
    conn_factory: ConnFactoryCallable,
  ) -> WidgetCachePayload:
    """
    Dispatches a single SQL or HTTP widget runner and attaches natural-text metadata when applicable.

    Args:
        widget_type (str): Widget type (`'SQL'`, `'HTTP'`, etc.).
        run_config (JsonObject): Prepared widget execution configuration.
        forward_token (str | None): Extracted Bearer token for HTTP forwarding.
        has_interactive_meta (bool): Whether natural-text metadata should be attached.
        effective_processor (str): Resolved processor identifier.
        effective_text (str | None): Resolved natural text input.
        http_runner_fn (HttpRunnerCallable): HTTP runner callable.
        sql_runner_fn (SqlRunnerCallable): SQL runner callable.
        conn_factory (ConnFactoryCallable): DuckDB connection factory.

    Returns:
        WidgetCachePayload: Execution result dictionary.
    """
    if widget_type == "SQL":
      res = await asyncio.to_thread(self._execute_single_sql_sync, run_config, sql_runner_fn, conn_factory)
      if has_interactive_meta:
        raw_query = run_config.get("query")
        res["generated_sql"] = str(raw_query) if raw_query is not None else None
        res["processor_used"] = effective_processor
        res["natural_text"] = effective_text
      return res
    if widget_type == "HTTP":
      return await http_runner_fn(run_config, forward_auth_token=forward_token)
    return {"error": f"Unknown widget type: {widget_type}"}


execution_service = ExecutionService()
