"""
Dashboard export service for generating JSON, CSV, and clinical PDF report exports.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
import contextlib
import csv
from dataclasses import dataclass
from datetime import UTC, datetime
import io
import json
from typing import Literal

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok, unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.models.dashboard import Dashboard, Widget
from app.schemas.execution import SqlRunnerResultDict
from app.schemas.json_types import JsonObject, JsonValue, SqlRow, SqlScalar
from app.schemas.widget import parse_sql_config_lenient
from app.services.dashboard.widget_service import ConnFactoryCallable
from app.services.pdf_export import WidgetPdfSnapshot, generate_clinical_pdf_report
from app.services.runners.sql import DuckDBCursorProtocol, run_sql_widget
from app.services.sql_utils import process_global_filters

SqlRunnerCallable = Callable[[DuckDBCursorProtocol, Mapping[str, JsonValue]], SqlRunnerResultDict]

ExportFormat = Literal["json", "csv", "pdf"]
"""Canonical literal union for supported dashboard report export formats."""


def sanitize_csv_value(val: SqlScalar | JsonValue) -> str:
  """
  Sanitizes cell values against CSV formula injection by prefixing with a single quote.

  Args:
      val (SqlScalar | JsonValue): Raw cell value to format.

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


@dataclass(frozen=True, slots=True)
class ExportedReportPayload:
  """
  Strongly typed binary or text export report payload returned by `DashboardExportService`.

  Attributes:
      content (bytes): Encoded report bytes.
      filename (str): Sanitized download filename.
      media_type (str): MIME media type (`application/json`, `text/csv`, `application/pdf`).
  """

  content: bytes
  filename: str
  media_type: str


class DashboardExportService:
  """
  Orchestrates JSON, CSV, and PDF report exports for dashboards and individual widgets.
  """

  def prepare_sql_run_config(
    self,
    config: Mapping[str, JsonValue] | None,
    global_params: Mapping[str, JsonValue] | None = None,
  ) -> JsonObject:
    """
    Clones a SQL widget config dictionary and injects global filter placeholders.

    Args:
        config (Mapping[str, JsonValue] | None): Raw widget config dictionary.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters.

    Returns:
        JsonObject: Config copy with `query` interpolated.
    """
    run_config: JsonObject = dict(config or {})
    parsed_sql = parse_sql_config_lenient(run_config)
    if parsed_sql.query:
      run_config["query"] = process_global_filters(parsed_sql.query, global_params or {})
    return run_config

  def build_dashboard_export_content(
    self,
    dashboard: Dashboard,
    export_format: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: Mapping[str, JsonValue] | None = None,
  ) -> AppResult[tuple[str, str, str]]:
    """
    Executes SQL widgets and formats a full dashboard export in JSON or CSV format.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters.

    Returns:
        AppResult[tuple[str, str, str]]: `Ok((content_str, media_type, filename))`.
    """
    safe_title = sanitize_filename_title(dashboard.name)
    factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection

    with contextlib.closing(factory()) as conn:
      cursor = conn.cursor()
      if export_format == "json":
        exported_widgets: list[dict[str, str | None | JsonObject | list[SqlRow]]] = []
        for widget in dashboard.widgets:
          data_records: list[SqlRow] = []
          if widget.type == "SQL":
            run_cfg = self.prepare_sql_run_config(widget.config, global_params)
            res = sql_runner_fn(cursor, run_cfg)
            data_records = res.get("data", [])

          exported_widgets.append(
            {
              "id": str(widget.id),
              "title": widget.title,
              "subtitle": widget.subtitle,
              "type": widget.type,
              "visualization": widget.visualization,
              "config": widget.config,
              "data": data_records,
            }
          )
        export_payload = {
          "dashboard_id": str(dashboard.id),
          "name": dashboard.name,
          "exported_at": datetime.now(UTC).isoformat(),
          "widgets": exported_widgets,
        }
        return Ok(
          (
            json.dumps(export_payload, indent=2, default=str),
            "application/json",
            f"{safe_title}_export.json",
          )
        )

      output = io.StringIO()
      writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
      writer.writerow(["# Dashboard Export", sanitize_csv_value(dashboard.name)])
      writer.writerow(["# Exported At", datetime.now(UTC).isoformat()])
      writer.writerow([])

      for widget in dashboard.widgets:
        writer.writerow([f"## Widget: {widget.title} ({widget.type})"])
        if widget.type == "SQL":
          run_cfg = self.prepare_sql_run_config(widget.config, global_params)
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

      return Ok((output.getvalue(), "text/csv", f"{safe_title}_export.csv"))

  def build_widget_export_content(
    self,
    dashboard: Dashboard,
    widget: Widget,
    export_format: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: Mapping[str, JsonValue] | None = None,
  ) -> AppResult[tuple[str, str, str]]:
    """
    Executes a single widget query and formats its export payload in JSON or CSV format.

    Args:
        dashboard (Dashboard): Parent dashboard model.
        widget (Widget): Target widget model to export.
        export_format (str): Target export format (`'json'` or `'csv'`).
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters.

    Returns:
        AppResult[tuple[str, str, str]]: `Ok((content_str, media_type, filename))`.
    """
    safe_title = sanitize_filename_title(widget.title)
    data_records: list[SqlRow] = []
    if widget.type == "SQL":
      factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
      with contextlib.closing(factory()) as conn:
        cursor = conn.cursor()
        run_cfg = self.prepare_sql_run_config(widget.config, global_params)
        res = sql_runner_fn(cursor, run_cfg)
        data_records = res.get("data", [])

    if export_format == "json":
      payload = {
        "dashboard_id": str(dashboard.id),
        "widget_id": str(widget.id),
        "title": widget.title,
        "subtitle": widget.subtitle,
        "type": widget.type,
        "visualization": widget.visualization,
        "config": widget.config,
        "data": data_records,
        "exported_at": datetime.now(UTC).isoformat(),
      }
      return Ok((json.dumps(payload, indent=2, default=str), "application/json", f"{safe_title}_export.json"))

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

    return Ok((output.getvalue(), "text/csv", f"{safe_title}_export.csv"))

  async def build_dashboard_pdf_async(
    self,
    dashboard: Dashboard,
    author_email: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: Mapping[str, JsonValue] | None = None,
  ) -> AppResult[tuple[bytes, str]]:
    """
    Asynchronously executes dashboard widget queries and renders a clinical PDF report.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        author_email (str): Email of the exporting user.
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters.

    Returns:
        AppResult[tuple[bytes, str]]: `Ok((pdf_bytes, filename))`.
    """
    safe_title = sanitize_filename_title(dashboard.name)
    widget_snapshots: list[tuple[str, str | None, str, JsonObject]] = [
      (w.title, w.subtitle, w.type, self.prepare_sql_run_config(w.config, global_params)) for w in dashboard.widgets
    ]

    def _build_pdf_sync() -> bytes:
      """
      Synchronous worker executing DuckDB queries and generating the PDF byte stream.

      Returns:
          bytes: PDF-1.4 document bytes.
      """
      widgets_data: list[WidgetPdfSnapshot] = []
      factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection
      with contextlib.closing(factory()) as conn:
        cursor = conn.cursor()
        for w_title, w_sub, w_type, w_cfg in widget_snapshots:
          rows: list[SqlRow] = []
          err: str | None = None
          if w_type == "SQL":
            res = sql_runner_fn(cursor, w_cfg)
            rows = res.get("data", [])
            err = res.get("error")
          widgets_data.append(
            WidgetPdfSnapshot(
              title=w_title,
              subtitle=w_sub,
              type=w_type,
              data=rows,
              error=err,
            )
          )

      return generate_clinical_pdf_report(
        dashboard_name=dashboard.name,
        author_email=author_email,
        widgets_data=widgets_data,
      )

    pdf_bytes = await asyncio.to_thread(_build_pdf_sync)
    return Ok((pdf_bytes, f"{safe_title}_clinical_report.pdf"))

  async def export_dashboard_report_result(
    self,
    dashboard: Dashboard,
    export_format: ExportFormat | str,
    author_email: str,
    conn_factory: ConnFactoryCallable | None = None,
    sql_runner_fn: SqlRunnerCallable = run_sql_widget,
    global_params: Mapping[str, JsonValue] | None = None,
  ) -> AppResult[ExportedReportPayload]:
    """
    Exports `dashboard` into an `ExportedReportPayload` (`json`, `csv`, or `pdf`) wrapped in `AppResult`.

    Args:
        dashboard (Dashboard): Authorized dashboard instance with widgets.
        export_format (ExportFormat | str): Target export format (`'json'`, `'csv'`, or `'pdf'`).
        author_email (str): Email of the exporting user.
        conn_factory (ConnFactoryCallable | None): Optional connection factory override.
        sql_runner_fn (SqlRunnerCallable): Optional SQL runner function override.
        global_params (Mapping[str, JsonValue] | None): Optional global filter parameters.

    Returns:
        AppResult[ExportedReportPayload]: `Ok(ExportedReportPayload)` or `Err(AppError)`.
    """
    fmt = export_format.lower().strip()
    if fmt == "pdf":
      pdf_res = await self.build_dashboard_pdf_async(
        dashboard=dashboard,
        author_email=author_email,
        conn_factory=conn_factory,
        sql_runner_fn=sql_runner_fn,
        global_params=global_params,
      )
      pdf_bytes, filename = unwrap_or_raise_http(pdf_res)
      return Ok(ExportedReportPayload(content=pdf_bytes, filename=filename, media_type="application/pdf"))
    if fmt in ("json", "csv"):
      export_res = await asyncio.to_thread(
        self.build_dashboard_export_content,
        dashboard,
        fmt,
        conn_factory,
        sql_runner_fn,
        global_params,
      )
      content_str, media_type, filename = unwrap_or_raise_http(export_res)
      return Ok(ExportedReportPayload(content=content_str.encode("utf-8"), filename=filename, media_type=media_type))
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Unsupported export format: {export_format}",
        status_code=400,
      )
    )


dashboard_export_service = DashboardExportService()

__all__ = [
  "DashboardExportService",
  "ExportFormat",
  "ExportedReportPayload",
  "SqlRunnerCallable",
  "dashboard_export_service",
  "sanitize_csv_value",
  "sanitize_filename_title",
]
