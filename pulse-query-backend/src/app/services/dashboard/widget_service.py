"""
Dashboard widget lifecycle and SQL validation service.
"""

from __future__ import annotations

from collections.abc import Callable
import contextlib
from uuid import UUID

import duckdb
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import sqlglot

from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.schemas.dashboard import WidgetReorderRequest
from app.schemas.widget import WidgetCreate, WidgetUpdate, is_valid_processor_identifier, parse_sql_config_lenient

ConnFactoryCallable = Callable[[], duckdb.DuckDBPyConnection]


class DashboardWidgetService:
  """
  Manages widget creation, update, deletion, reordering, and SQL syntax validation.
  """

  def validate_sql_query_result(
    self,
    query: str,
    accept_language: str | None = None,
    conn_factory: ConnFactoryCallable | None = None,
  ) -> AppResult[bool]:
    """
    Validates a SQL query via AST statement count check and DuckDB `PREPARE`.

    Args:
        query (str): Raw SQL string to validate.
        accept_language (str | None): Optional HTTP `Accept-Language` header.
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.

    Returns:
        AppResult[bool]: `Ok(True)` if valid or empty, else `Err(AppError)` with localized message.
    """
    if not query or not query.strip():
      return Ok(True)

    clean_query = query.strip()
    try:
      statements = [s for s in sqlglot.parse(clean_query, read="duckdb") if s is not None]
      if len(statements) > 1:
        msg = get_translated_message(accept_language, "error.invalid_sql", "Invalid SQL Query")
        return Err(
          AppError(
            code=ErrorCode.SQL_VALIDATION_ERROR,
            message=f"{msg}: Multiple SQL statements are not permitted.",
            status_code=400,
          )
        )
    except sqlglot.errors.ParseError:
      pass

    factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
    with duckdb_manager._write_lock, contextlib.closing(factory()) as conn:
      try:
        conn.execute(f"PREPARE v AS {clean_query}")
        conn.execute("DEALLOCATE v")
        return Ok(True)
      except (duckdb.Error, RuntimeError, ValueError, TypeError, OSError) as e:
        error_msg = str(e).split(chr(10))[0]
        msg = get_translated_message(accept_language, "error.invalid_sql", "Invalid SQL Query")
        return Err(
          AppError(
            code=ErrorCode.SQL_VALIDATION_ERROR,
            message=f"{msg}: {error_msg}",
            status_code=400,
          )
        )

  async def validate_sql_query_async(
    self,
    query: str,
    accept_language: str | None = None,
    conn_factory: ConnFactoryCallable | None = None,
  ) -> AppResult[bool]:
    """
    Asynchronously validates a SQL query on a worker thread via `run_in_duckdb_thread`.

    Args:
        query (str): Raw SQL string to validate.
        accept_language (str | None): Optional HTTP `Accept-Language` header.
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.

    Returns:
        AppResult[bool]: `Ok(True)` if valid or empty, else `Err(AppError)` with localized message.
    """
    return await run_in_duckdb_thread(self.validate_sql_query_result, query, accept_language, conn_factory)

  async def create_widget_result(
    self,
    dashboard_id: UUID,
    widget_in: WidgetCreate,
    current_user: User,
    db: AsyncSession,
    accept_language: str | None = None,
    conn_factory: ConnFactoryCallable | None = None,
  ) -> AppResult[Widget]:
    """
    Validates and creates a new widget attached to `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        widget_in (WidgetCreate): Polymorphic widget creation payload.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        accept_language (str | None): Optional HTTP `Accept-Language` header.
        conn_factory (ConnFactoryCallable | None): Optional DuckDB connection factory override.

    Returns:
        AppResult[Widget]: `Ok(Widget)` on success, or `Err(AppError)` on SQL validation failure.
    """
    if widget_in.type == "SQL" and widget_in.config.query:
      val_res = await self.validate_sql_query_async(
        widget_in.config.query,
        accept_language or current_user.language_preference,
        conn_factory=conn_factory,
      )
      if isinstance(val_res, Err):
        return val_res

    config_dump = widget_in.config.model_dump(mode="json")
    if widget_in.subtitle is not None and widget_in.subtitle.strip():
      config_dump["subtitle"] = widget_in.subtitle.strip()

    widget = Widget(
      dashboard_id=dashboard_id,
      title=widget_in.title,
      type=widget_in.type,
      visualization=widget_in.visualization,
      config=config_dump,
    )
    db.add(widget)
    await db.commit()
    return Ok(widget)

  async def get_widget_by_id_result(
    self,
    widget_id: UUID,
    current_user: User,
    db: AsyncSession,
    accept_language: str | None = None,
  ) -> AppResult[Widget]:
    """
    Fetches a `Widget` by primary key, returning a localized `404` `AppError` if missing.

    Args:
        widget_id (UUID): Target widget UUID.
        current_user (User): Requesting user model instance.
        db (AsyncSession): Active database session.
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[Widget]: `Ok(Widget)` if found, else `Err(AppError)`.
    """
    result = await db.execute(select(Widget).where(Widget.id == widget_id))
    widget = result.scalars().first()
    if not widget:
      msg = get_translated_message(
        accept_language or current_user.language_preference, "error.widget_not_found", "Widget not found"
      )
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=msg, status_code=404))
    return Ok(widget)

  async def update_widget_result(
    self,
    widget: Widget,
    widget_in: WidgetUpdate,
    current_user: User,
    db: AsyncSession,
    accept_language: str | None = None,
    conn_factory: ConnFactoryCallable | None = None,
  ) -> AppResult[Widget]:
    """
    Validates and applies partial updates to an authorized `widget`.

    Args:
        widget (Widget): Existing widget ORM instance.
        widget_in (WidgetUpdate): Partial widget update payload.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        accept_language (str | None): Optional HTTP `Accept-Language` header.
        conn_factory (ConnFactoryCallable | None): Optional DuckDB connection factory override.

    Returns:
        AppResult[Widget]: `Ok(Widget)` on success, or `Err(AppError)` on SQL validation failure.
    """
    if widget.type == "SQL" and widget_in.config:
      parsed_sql_cfg = parse_sql_config_lenient(widget_in.config)
      if "processor" in widget_in.config and not is_valid_processor_identifier(parsed_sql_cfg.processor):
        return Err(
          AppError(
            code=ErrorCode.VALIDATION_ERROR,
            message="Invalid processor identifier. Expected 'SQL' or '<provider>:<model>'.",
            status_code=400,
          )
        )
      if parsed_sql_cfg.query and parsed_sql_cfg.query.strip():
        val_res = await self.validate_sql_query_async(
          parsed_sql_cfg.query,
          accept_language or current_user.language_preference,
          conn_factory=conn_factory,
        )
        if isinstance(val_res, Err):
          return val_res

    widget.title = widget_in.title if widget_in.title is not None else widget.title
    widget.visualization = widget_in.visualization if widget_in.visualization is not None else widget.visualization
    if widget_in.config is not None:
      merged_config = dict(widget_in.config)
      if (
        "subtitle" not in merged_config
        and widget_in.subtitle is None
        and isinstance(widget.config, dict)
        and "subtitle" in widget.config
      ):
        merged_config["subtitle"] = widget.config["subtitle"]
      widget.config = merged_config
    if widget_in.subtitle is not None:
      widget.subtitle = widget_in.subtitle

    await db.commit()
    return Ok(widget)

  async def delete_widget_result(
    self,
    widget: Widget,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Deletes an authorized `widget` and commits the transaction.

    Args:
        widget (Widget): Existing widget ORM instance.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[bool]: `Ok(True)` once deleted.
    """
    await db.delete(widget)
    await db.commit()
    return Ok(True)

  def get_dashboard_widget_result(
    self,
    dashboard: Dashboard,
    widget_id: UUID,
  ) -> AppResult[Widget]:
    """
    Finds a specific `widget_id` inside `dashboard.widgets`, returning `AppResult[Widget]`.

    Args:
        dashboard (Dashboard): Loaded dashboard ORM instance with `widgets`.
        widget_id (UUID): Target widget UUID within the dashboard.

    Returns:
        AppResult[Widget]: `Ok(Widget)` if present, else `Err(AppError)` with status 404.
    """
    widget = next((w for w in dashboard.widgets if w.id == widget_id), None)
    if not widget:
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message="Widget not found", status_code=404))
    return Ok(widget)

  async def reorder_widgets(
    self,
    dashboard_id: UUID,
    request: WidgetReorderRequest,
    db: AsyncSession,
  ) -> AppResult[dict[str, int]]:
    """
    Bulk updates widget order and group positions within `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        request (WidgetReorderRequest): Reorder items payload.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[dict[str, int]]: `Ok({"updated": updated_count})`.
    """
    result = await db.execute(select(Widget).where(Widget.dashboard_id == dashboard_id))
    widgets_db = {w.id: w for w in result.scalars().all()}

    updated_count = 0
    for item in request.items:
      if item.id in widgets_db:
        widget = widgets_db[item.id]
        new_config = widget.config.copy()
        new_config["order"] = item.order
        if item.group is not None:
          new_config["group"] = item.group
        widget.config = new_config
        updated_count += 1

    await db.commit()
    return Ok({"updated": updated_count})


dashboard_widget_service = DashboardWidgetService()

__all__ = [
  "ConnFactoryCallable",
  "DashboardWidgetService",
  "dashboard_widget_service",
]
