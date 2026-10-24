"""
Dashboard Service Module.

Encapsulates dashboard CRUD, widget lifecycle management, multi-user sharing,
access control, SQL syntax validation, and JSON/CSV/PDF analytical report export orchestration.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import copy
import csv
from datetime import UTC, datetime
import io
import json
from typing import Any
from uuid import UUID

import duckdb
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import sqlglot

from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.user import User
from app.schemas.dashboard import (
  DashboardCreate,
  DashboardShareCreate,
  DashboardShareResponse,
  WidgetReorderRequest,
)
from app.schemas.execution import SqlRunnerResultDict
from app.schemas.widget import WidgetCreate, WidgetUpdate
from app.services.pdf_export import generate_clinical_pdf_report
from app.services.provisioning import provisioning_service
from app.services.runners.sql import DuckDBCursorProtocol, run_sql_widget
from app.services.sql_utils import process_global_filters

ConnFactoryCallable = Callable[[], duckdb.DuckDBPyConnection]
SqlRunnerCallable = Callable[[DuckDBCursorProtocol, dict[str, Any]], SqlRunnerResultDict | dict[str, Any]]


def sanitize_csv_value(val: object) -> str:
  """
  Sanitizes cell values against CSV formula injection by prefixing with a single quote.

  Args:
      val (object): Raw cell value to format.

  Returns:
      str: Formula-safe string representation.
  """
  s = str(val) if val is not None else ""
  if s and s[0] in ("=", "+", "-", "@", chr(9), chr(13)):
    return f"'{s}"
  return s


def sanitize_filename_title(title: str) -> str:
  """
  Converts a dashboard or widget title into a safe filename stem.

  Args:
      title (str): Raw dashboard or widget name.

  Returns:
      str: Alphanumeric/underscore/hyphen filename stem.
  """
  return "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in title)


class DashboardService:
  """
  Domain service handling dashboard CRUD, widget mutations, sharing, access control,
  SQL validation, and analytical exports.
  """

  async def get_dashboard_with_access_result(
    self,
    dashboard_id: UUID,
    current_user: User,
    db: AsyncSession,
    required_level: str = "VIEW",
    accept_language: str | None = None,
  ) -> AppResult[tuple[Dashboard, str]]:
    """
    Verifies that `current_user` holds `required_level` access to `dashboard_id`, returning `AppResult`.

    Args:
        dashboard_id (UUID): Target dashboard ID.
        current_user (User): Requesting user model instance.
        db (AsyncSession): Active database session.
        required_level (str): Minimum required permission (`VIEW`, `EDIT`, `OWNER`).
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[tuple[Dashboard, str]]: `Ok((dashboard, permission_level))` or `Err(AppError)`.
    """
    stmt = (
      select(Dashboard)
      .where(Dashboard.id == dashboard_id)
      .options(selectinload(Dashboard.widgets), selectinload(Dashboard.shares))
    )
    result = await db.execute(stmt)
    dashboard = result.scalars().first()
    if not dashboard:
      msg = get_translated_message(
        accept_language or current_user.language_preference, "error.dashboard_not_found", "Dashboard not found"
      )
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=msg, status_code=404))

    if dashboard.owner_id == current_user.id:
      return Ok((dashboard, "OWNER"))

    if required_level == "OWNER":
      return Err(
        AppError(
          code=ErrorCode.AUTHORIZATION_ERROR,
          message="Only the dashboard owner can perform this action.",
          status_code=403,
        )
      )

    share_stmt = select(DashboardShare).where(
      and_(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == current_user.id)
    )
    share_res = await db.execute(share_stmt)
    share = share_res.scalars().first()

    if not share:
      msg = get_translated_message(
        accept_language or current_user.language_preference, "error.dashboard_not_found", "Dashboard not found"
      )
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=msg, status_code=404))

    if required_level == "EDIT" and share.permission_level.upper() != "EDIT":
      return Err(
        AppError(
          code=ErrorCode.AUTHORIZATION_ERROR,
          message="Edit permission required for this operation.",
          status_code=403,
        )
      )

    return Ok((dashboard, share.permission_level.upper()))

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
    conn = factory()
    try:
      conn.execute(f"PREPARE v AS {clean_query}")
      conn.execute("DEALLOCATE v")
      return Ok(True)
    except Exception as e:
      error_msg = str(e).split(chr(10))[0]
      msg = get_translated_message(accept_language, "error.invalid_sql", "Invalid SQL Query")
      return Err(
        AppError(
          code=ErrorCode.SQL_VALIDATION_ERROR,
          message=f"{msg}: {error_msg}",
          status_code=400,
        )
      )
    finally:
      conn.close()

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

  async def update_dashboard_result(
    self,
    dashboard: Dashboard,
    permission_level: str,
    dashboard_update: DashboardCreate,
    db: AsyncSession,
  ) -> AppResult[Dashboard]:
    """
    Renames an authorized `dashboard` and persists the change.

    Args:
        dashboard (Dashboard): Authorized dashboard ORM model.
        permission_level (str): Resolved access level (`OWNER` or `EDIT`).
        dashboard_update (DashboardCreate): Updated name payload.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Dashboard]: `Ok(Dashboard)` with `permission_level` populated.
    """
    dashboard.name = dashboard_update.name
    await db.commit()
    dashboard.permission_level = permission_level
    return Ok(dashboard)

  async def delete_dashboard_result(
    self,
    dashboard: Dashboard,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Deletes an authorized `dashboard` and commits the transaction.

    Args:
        dashboard (Dashboard): Authorized dashboard ORM model.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[bool]: `Ok(True)` once deleted.
    """
    await db.delete(dashboard)
    await db.commit()
    return Ok(True)

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
    if widget_in.type == "SQL":
      val_res = await self.validate_sql_query_async(
        widget_in.config.query,
        accept_language or current_user.language_preference,
        conn_factory=conn_factory,
      )
      if isinstance(val_res, Err):
        return val_res

    widget = Widget(
      dashboard_id=dashboard_id,
      title=widget_in.title,
      type=widget_in.type,
      visualization=widget_in.visualization,
      config=widget_in.config.model_dump(mode="json"),
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
    if widget.type == "SQL" and widget_in.config and "query" in widget_in.config:
      val_res = await self.validate_sql_query_async(
        str(widget_in.config["query"]),
        accept_language or current_user.language_preference,
        conn_factory=conn_factory,
      )
      if isinstance(val_res, Err):
        return val_res

    update_data = widget_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
      setattr(widget, key, value)

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

  async def list_user_dashboards(self, current_user: User, db: AsyncSession) -> list[Dashboard]:
    """
    Lists all dashboards owned by or shared with `current_user`.

    Args:
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        list[Dashboard]: Owned and shared dashboards with `permission_level` populated.
    """
    owned_stmt = select(Dashboard).where(Dashboard.owner_id == current_user.id).options(selectinload(Dashboard.widgets))
    owned_res = await db.execute(owned_stmt)
    owned_dashboards = list(owned_res.scalars().all())
    for d in owned_dashboards:
      d.permission_level = "OWNER"

    shared_stmt = (
      select(Dashboard, DashboardShare.permission_level)
      .join(DashboardShare, Dashboard.id == DashboardShare.dashboard_id)
      .where(DashboardShare.user_id == current_user.id)
      .options(selectinload(Dashboard.widgets))
    )
    shared_res = await db.execute(shared_stmt)
    shared_dashboards: list[Dashboard] = []
    for d, perm in shared_res.all():
      d.permission_level = perm
      shared_dashboards.append(d)

    return owned_dashboards + shared_dashboards

  async def _reload_dashboard_with_widgets_result(
    self,
    dashboard_id: UUID,
    db: AsyncSession,
    not_found_message: str = "Dashboard not found",
  ) -> AppResult[Dashboard]:
    """
    Reloads a committed `Dashboard` with its `widgets` eagerly loaded and sets `permission_level = "OWNER"`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        db (AsyncSession): Active database session.
        not_found_message (str): Error message if reload returns None.

    Returns:
        AppResult[Dashboard]: `Ok(Dashboard)` or `Err(AppError)` with status 404.
    """
    result = await db.execute(
      select(Dashboard).where(Dashboard.id == dashboard_id).options(selectinload(Dashboard.widgets))
    )
    dashboard = result.scalars().first()
    if not dashboard:
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message=not_found_message, status_code=404))
    dashboard.permission_level = "OWNER"
    return Ok(dashboard)

  async def create_dashboard_result(
    self,
    dashboard_in: DashboardCreate,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Dashboard]:
    """
    Creates a new empty dashboard owned by `current_user`.

    Args:
        dashboard_in (DashboardCreate): Creation payload containing `name`.
        current_user (User): Authenticated owner.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Dashboard]: `Ok(Dashboard)` or `Err(AppError)` if reload fails.
    """
    new_dashboard = Dashboard(name=dashboard_in.name, owner_id=current_user.id)
    db.add(new_dashboard)
    await db.commit()
    return await self._reload_dashboard_with_widgets_result(new_dashboard.id, db, "Dashboard not found")

  async def clone_dashboard_result(
    self,
    source_dashboard: Dashboard,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Dashboard]:
    """
    Creates a deep copy of `source_dashboard` and all its widgets for `current_user`.

    Args:
        source_dashboard (Dashboard): Authorized source dashboard with widgets.
        current_user (User): Authenticated user receiving the clone.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Dashboard]: `Ok(Dashboard)` or `Err(AppError)` if reload fails.
    """
    new_dashboard = Dashboard(name=f"Copy of {source_dashboard.name}", owner_id=current_user.id)
    db.add(new_dashboard)
    await db.flush()

    for widget in source_dashboard.widgets:
      new_widget = Widget(
        dashboard_id=new_dashboard.id,
        title=widget.title,
        type=widget.type,
        visualization=widget.visualization,
        config=copy.deepcopy(widget.config) if widget.config else {},
      )
      db.add(new_widget)

    await db.commit()
    return await self._reload_dashboard_with_widgets_result(new_dashboard.id, db, "Cloned dashboard could not be loaded")

  async def restore_default_dashboard_result(
    self,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Dashboard]:
    """
    Restores the default 'Hospital Command Center' dashboard for `current_user`.

    Args:
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Dashboard]: `Ok(Dashboard)` or `Err(AppError)` if reload fails.
    """
    dashboard = await provisioning_service.restore_defaults(db, current_user)
    await db.commit()
    return await self._reload_dashboard_with_widgets_result(dashboard.id, db, "Default dashboard could not be restored")

  async def reorder_widgets(
    self,
    dashboard_id: UUID,
    request: WidgetReorderRequest,
    db: AsyncSession,
  ) -> dict[str, int]:
    """
    Bulk updates widget order and group positions within `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        request (WidgetReorderRequest): Reorder items payload.
        db (AsyncSession): Active database session.

    Returns:
        dict[str, int]: Dictionary containing `{"updated": updated_count}`.
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
    return {"updated": updated_count}

  async def share_dashboard_result(
    self,
    dashboard_id: UUID,
    share_in: DashboardShareCreate,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[DashboardShareResponse]:
    """
    Grants or updates a collaborator share on `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        share_in (DashboardShareCreate): Target user email and permission level.
        current_user (User): Authenticated dashboard owner.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[DashboardShareResponse]: `Ok(DashboardShareResponse)` or `Err(AppError)`.
    """
    user_stmt = select(User).where(User.email == share_in.user_email)
    target_user = (await db.execute(user_stmt)).scalars().first()
    if not target_user:
      return Err(AppError(code=ErrorCode.RESOURCE_NOT_FOUND, message="Target user not found", status_code=404))

    if target_user.id == current_user.id:
      return Err(
        AppError(code=ErrorCode.SHARE_SELF_FORBIDDEN, message="Cannot share dashboard with yourself", status_code=400)
      )

    perm = share_in.permission_level.upper()
    if perm not in ("VIEW", "EDIT"):
      return Err(
        AppError(
          code=ErrorCode.SHARE_INVALID_PERMISSION,
          message="Permission level must be VIEW or EDIT",
          status_code=400,
        )
      )

    existing_stmt = select(DashboardShare).where(
      and_(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == target_user.id)
    )
    existing = (await db.execute(existing_stmt)).scalars().first()

    if existing:
      existing.permission_level = perm
      share = existing
    else:
      share = DashboardShare(
        dashboard_id=dashboard_id,
        user_id=target_user.id,
        permission_level=perm,
      )
      db.add(share)

    await db.commit()
    await db.refresh(share)

    return Ok(
      DashboardShareResponse(
        id=share.id,
        dashboard_id=share.dashboard_id,
        user_id=target_user.id,
        user_email=target_user.email,
        permission_level=share.permission_level,
      )
    )

  async def list_dashboard_shares(
    self,
    dashboard_id: UUID,
    db: AsyncSession,
  ) -> list[DashboardShareResponse]:
    """
    Lists all active shares on `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        db (AsyncSession): Active database session.

    Returns:
        list[DashboardShareResponse]: List of active collaborator shares.
    """
    stmt = (
      select(DashboardShare, User.email)
      .join(User, DashboardShare.user_id == User.id)
      .where(DashboardShare.dashboard_id == dashboard_id)
    )
    res = await db.execute(stmt)
    return [
      DashboardShareResponse(
        id=share.id,
        dashboard_id=share.dashboard_id,
        user_id=share.user_id,
        user_email=email,
        permission_level=share.permission_level,
      )
      for share, email in res.all()
    ]

  async def delete_dashboard_share_result(
    self,
    dashboard_id: UUID,
    share_id: UUID,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Revokes a collaborator share from `dashboard_id`.

    Args:
        dashboard_id (UUID): Target dashboard UUID.
        share_id (UUID): Share record UUID to revoke.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[bool]: `Ok(True)` if deleted, or `Err(AppError)` if not found.
    """
    stmt = select(DashboardShare).where(and_(DashboardShare.id == share_id, DashboardShare.dashboard_id == dashboard_id))
    share = (await db.execute(stmt)).scalars().first()
    if not share:
      return Err(AppError(code=ErrorCode.SHARE_NOT_FOUND, message="Share not found", status_code=404))

    await db.delete(share)
    await db.commit()
    return Ok(True)

  def _prepare_sql_run_config(
    self,
    config: dict[str, Any],
    global_params: dict[str, Any] | None = None,
  ) -> dict[str, Any]:
    """
    Clones a SQL widget config dictionary and injects global filter placeholders.

    Args:
        config (dict[str, Any]): Raw widget config dictionary.
        global_params (dict[str, Any] | None): Optional global filter parameters.

    Returns:
        dict[str, Any]: Config copy with `query` interpolated.
    """
    run_config = dict(config or {})
    if "query" in run_config and isinstance(run_config["query"], str):
      run_config["query"] = process_global_filters(run_config["query"], global_params or {})
    return run_config

  def build_dashboard_export_content(
    self,
    dashboard: Dashboard,
    export_format: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: dict[str, Any] | None = None,
  ) -> tuple[str, str, str]:
    """
    Executes SQL widgets and formats a full dashboard export in JSON or CSV format.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (dict[str, Any] | None): Optional global filter parameters.

    Returns:
        tuple[str, str, str]: Tuple of `(content_str, media_type, filename)`.
    """
    safe_title = sanitize_filename_title(dashboard.name)
    factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
    conn = factory()

    try:
      cursor = conn.cursor()
      if export_format == "json":
        export_payload: dict[str, Any] = {
          "dashboard_id": str(dashboard.id),
          "name": dashboard.name,
          "exported_at": datetime.now(UTC).isoformat(),
          "widgets": [],
        }
        for widget in dashboard.widgets:
          data_records: list[dict[str, Any]] = []
          if widget.type == "SQL":
            run_cfg = self._prepare_sql_run_config(widget.config, global_params)
            res = sql_runner_fn(cursor, run_cfg)
            data_records = res.get("data", [])

          export_payload["widgets"].append(
            {
              "id": str(widget.id),
              "title": widget.title,
              "type": widget.type,
              "visualization": widget.visualization,
              "config": widget.config,
              "data": data_records,
            }
          )
        return (
          json.dumps(export_payload, indent=2),
          "application/json",
          f"{safe_title}_export.json",
        )

      output = io.StringIO()
      writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
      writer.writerow(["# Dashboard Export", sanitize_csv_value(dashboard.name)])
      writer.writerow(["# Exported At", datetime.now(UTC).isoformat()])
      writer.writerow([])

      for widget in dashboard.widgets:
        writer.writerow([f"## Widget: {widget.title} ({widget.type})"])
        if widget.type == "SQL":
          run_cfg = self._prepare_sql_run_config(widget.config, global_params)
          res = sql_runner_fn(cursor, run_cfg)
          records = res.get("data", [])
          if records and isinstance(records, list):
            headers = list(records[0].keys())
            writer.writerow([sanitize_csv_value(h) for h in headers])
            for row in records:
              writer.writerow([sanitize_csv_value(row.get(h)) for h in headers])
          elif res.get("error"):
            writer.writerow([f"Error: {res['error']}"])
          else:
            writer.writerow(["No data"])
        writer.writerow([])

      return output.getvalue(), "text/csv", f"{safe_title}_export.csv"
    finally:
      conn.close()

  def build_widget_export_content(
    self,
    dashboard: Dashboard,
    widget: Widget,
    export_format: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: dict[str, Any] | None = None,
  ) -> tuple[str, str, str]:
    """
    Executes a single widget query and formats its export payload in JSON or CSV format.

    Args:
        dashboard (Dashboard): Parent dashboard model.
        widget (Widget): Target widget model to export.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (dict[str, Any] | None): Optional global filter parameters.

    Returns:
        tuple[str, str, str]: Tuple of `(content_str, media_type, filename)`.
    """
    safe_title = sanitize_filename_title(widget.title)
    data_records: list[dict[str, Any]] = []
    if widget.type == "SQL":
      factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
      conn = factory()
      try:
        cursor = conn.cursor()
        run_cfg = self._prepare_sql_run_config(widget.config, global_params)
        res = sql_runner_fn(cursor, run_cfg)
        data_records = res.get("data", [])
      finally:
        conn.close()

    if export_format == "json":
      payload = {
        "dashboard_id": str(dashboard.id),
        "widget_id": str(widget.id),
        "title": widget.title,
        "type": widget.type,
        "visualization": widget.visualization,
        "config": widget.config,
        "data": data_records,
        "exported_at": datetime.now(UTC).isoformat(),
      }
      return json.dumps(payload, indent=2), "application/json", f"{safe_title}_export.json"

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["# Widget Export", sanitize_csv_value(widget.title)])
    writer.writerow(["# Type", widget.type])
    writer.writerow(["# Exported At", datetime.now(UTC).isoformat()])
    writer.writerow([])

    if data_records and isinstance(data_records, list):
      headers = list(data_records[0].keys())
      writer.writerow([sanitize_csv_value(h) for h in headers])
      for row in data_records:
        writer.writerow([sanitize_csv_value(row.get(h)) for h in headers])
    else:
      writer.writerow(["No data"])

    return output.getvalue(), "text/csv", f"{safe_title}_export.csv"

  async def build_dashboard_pdf_async(
    self,
    dashboard: Dashboard,
    author_email: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: dict[str, Any] | None = None,
  ) -> tuple[bytes, str]:
    """
    Asynchronously executes dashboard widget queries and renders a clinical PDF report.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        author_email (str): Email of the exporting user.
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (dict[str, Any] | None): Optional global filter parameters.

    Returns:
        tuple[bytes, str]: Tuple of `(pdf_bytes, filename)`.
    """
    safe_title = sanitize_filename_title(dashboard.name)
    widget_snapshots: list[dict[str, Any]] = [
      {"title": w.title, "type": w.type, "config": self._prepare_sql_run_config(w.config, global_params)}
      for w in dashboard.widgets
    ]

    def _build_pdf_sync() -> bytes:
      """
      Synchronous worker executing DuckDB queries and generating the PDF byte stream.

      Returns:
          bytes: PDF-1.4 document bytes.
      """
      widgets_data: list[dict[str, Any]] = []
      factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
      conn = factory()
      try:
        cursor = conn.cursor()
        for w_snap in widget_snapshots:
          w_info: dict[str, Any] = {
            "title": w_snap["title"],
            "type": w_snap["type"],
            "data": [],
            "error": None,
          }
          if w_snap["type"] == "SQL":
            res = sql_runner_fn(cursor, w_snap["config"])
            w_info["data"] = res.get("data", [])
            w_info["error"] = res.get("error")
          widgets_data.append(w_info)
      finally:
        conn.close()

      return generate_clinical_pdf_report(
        dashboard_name=dashboard.name,
        author_email=author_email,
        widgets_data=widgets_data,
      )

    pdf_bytes = await asyncio.to_thread(_build_pdf_sync)
    return pdf_bytes, f"{safe_title}_clinical_report.pdf"


dashboard_service = DashboardService()
