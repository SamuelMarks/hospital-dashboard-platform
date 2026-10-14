"""
Dashboard Service Module.

Encapsulates dashboard access control, SQL syntax validation, and
JSON/CSV/PDF analytical report export orchestration.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.user import User
from app.services.pdf_export import generate_clinical_pdf_report
from app.services.runners.sql import run_sql_widget


def sanitize_csv_value(val: Any) -> str:
  """
  Sanitizes cell values against CSV formula injection by prefixing with a single quote.

  Args:
      val (Any): Raw cell value to format.

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
  Domain service handling dashboard access control, SQL validation, and exports.
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
    conn_factory: Any = None,
  ) -> AppResult[bool]:
    """
    Validates a SQL query via DuckDB `PREPARE`, returning an explicit `AppResult[bool]`.

    Args:
        query (str): Raw SQL string to validate.
        accept_language (str | None): Optional HTTP `Accept-Language` header.
        conn_factory (Any): Optional connection factory override.

    Returns:
        AppResult[bool]: `Ok(True)` if valid or empty, else `Err(AppError)` with localized message.
    """
    if not query or not query.strip():
      return Ok(True)

    factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
    conn = factory()
    try:
      conn.execute(f"PREPARE v AS {query}")
      conn.execute("DEALLOCATE v")
      return Ok(True)
    except Exception as e:
      error_msg = str(e).split("\n")[0]
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

  def build_dashboard_export_content(
    self,
    dashboard: Dashboard,
    export_format: str,
    conn_factory: Any = None,
    sql_runner_fn: Any = run_sql_widget,
  ) -> tuple[str, str, str]:
    """
    Executes SQL widgets and formats a full dashboard export in JSON or CSV format.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (Any): Optional connection factory override.
        sql_runner_fn (Any): Optional SQL runner function override.

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
            res = sql_runner_fn(cursor, widget.config)
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
          res = sql_runner_fn(cursor, widget.config)
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
    conn_factory: Any = None,
    sql_runner_fn: Any = run_sql_widget,
  ) -> tuple[str, str, str]:
    """
    Executes a single widget query and formats its export payload in JSON or CSV format.

    Args:
        dashboard (Dashboard): Parent dashboard model.
        widget (Widget): Target widget model to export.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (Any): Optional connection factory override.
        sql_runner_fn (Any): Optional SQL runner function override.

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
        res = sql_runner_fn(cursor, widget.config)
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
    conn_factory: Any = None,
    sql_runner_fn: Any = run_sql_widget,
  ) -> tuple[bytes, str]:
    """
    Asynchronously executes dashboard widget queries and renders a clinical PDF report.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        author_email (str): Email of the exporting user.
        conn_factory (Any): Optional connection factory override.
        sql_runner_fn (Any): Optional SQL runner function override.

    Returns:
        tuple[bytes, str]: Tuple of `(pdf_bytes, filename)`.
    """
    safe_title = sanitize_filename_title(dashboard.name)
    widget_snapshots = [{"title": w.title, "type": w.type, "config": dict(w.config or {})} for w in dashboard.widgets]

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
