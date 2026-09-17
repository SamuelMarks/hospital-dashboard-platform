"""
Dashboards API Router.

Handles CRUD operations for Dashboards and Widgets.
Allows users to create, list, update, and delete their analytics workspaces.
Also provides the ability to restore the default content pack and clone existing dashboards.
"""

import copy
import csv
import io
import json
from datetime import UTC, datetime
from typing import Annotated, Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.i18n import get_translated_message
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.user import User
from app.schemas.dashboard import (
  DashboardCreate,
  DashboardResponse,
  DashboardShareCreate,
  DashboardShareResponse,
  WidgetReorderRequest,
  WidgetResponse,
)
from app.schemas.widget import (
  WidgetCreate,
  WidgetUpdate,
)
from app.services.provisioning import provisioning_service
from app.services.runners.sql import run_sql_widget

router = APIRouter()

# --- Validation and Access Control Helpers ---


async def get_dashboard_with_access(
  dashboard_id: UUID,
  current_user: User,
  db: AsyncSession,
  required_level: str = "VIEW",
  accept_language: str | None = None,
) -> tuple[Dashboard, str]:
  """
  Verifies that the user has the required access level to the dashboard.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Requesting user.
      db (AsyncSession): Database session.
      required_level (str): Minimum required permission ('VIEW', 'EDIT', 'OWNER').
      accept_language (Optional[str]): Language preference.

  Returns:
      tuple[Dashboard, str]: The dashboard and the resolved permission level ('OWNER', 'EDIT', 'VIEW').

  Raises:
      HTTPException: 404 if not found, 403 if permission denied.
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
    raise HTTPException(status_code=404, detail=msg)

  # Check Ownership
  if dashboard.owner_id == current_user.id:
    return dashboard, "OWNER"

  if required_level == "OWNER":
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the dashboard owner can perform this action.")

  # Check Share permissions
  share_stmt = select(DashboardShare).where(
    and_(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == current_user.id)
  )
  share_res = await db.execute(share_stmt)
  share = share_res.scalars().first()

  if not share:
    msg = get_translated_message(
      accept_language or current_user.language_preference, "error.dashboard_not_found", "Dashboard not found"
    )
    raise HTTPException(status_code=404, detail=msg)

  if required_level == "EDIT" and share.permission_level.upper() != "EDIT":
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Edit permission required for this operation.")

  return dashboard, share.permission_level.upper()


_get_dashboard_with_access = get_dashboard_with_access


def _validate_sql_query(query: str, accept_language: str | None = None) -> None:
  """
  Performs a 'Dry Run' of the SQL query using DuckDB's PREPARE statement.
  This checks for syntax errors and schema validity (table existence) without
  executing the query or returning data.

  Args:
      query (str): The raw SQL string.

  Raises:
      HTTPException: If the SQL is invalid (400 Bad Request).
  """
  if not query or not query.strip():
    return

  conn = duckdb_manager.get_readonly_connection()
  try:
    # PREPARE parses and binds the query. If table missing or syntax wrong, it raises.
    conn.execute(f"PREPARE v AS {query}")
    # Cleanup
    conn.execute("DEALLOCATE v")
  except Exception as e:
    # Extract the specific DuckDB error message
    error_msg = str(e).split("\n")[0]  # First line usually contains the core reason
    msg = get_translated_message(accept_language, "error.invalid_sql", "Invalid SQL Query")
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"{msg}: {error_msg}",
    )
  finally:
    conn.close()


# --- Dashboards ---


@router.get("/", response_model=list[DashboardResponse])
@router.get("", response_model=list[DashboardResponse])
async def list_dashboards(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """List all dashboards owned by or shared with the current user."""
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
  shared_dashboards = []
  for d, perm in shared_res.all():
    d.permission_level = perm
    shared_dashboards.append(d)

  return owned_dashboards + shared_dashboards


@router.post("/", response_model=DashboardResponse)
async def create_dashboard(
  dashboard_in: DashboardCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Create a new empty dashboard."""
  new_dashboard = Dashboard(name=dashboard_in.name, owner_id=current_user.id)
  db.add(new_dashboard)
  await db.commit()

  result = await db.execute(
    select(Dashboard).where(Dashboard.id == new_dashboard.id).options(selectinload(Dashboard.widgets))
  )
  dashboard = result.scalars().first()
  if not dashboard:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
  dashboard.permission_level = "OWNER"
  return dashboard


@router.post("/{dashboard_id}/clone", response_model=DashboardResponse)
async def clone_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """
  Creates a deep copy of an existing dashboard and all its widgets.
  The new dashboard will have the name "Copy of {original_name}".

  Args:
      dashboard_id (UUID): The ID of the dashboard to clone.
      current_user (User): Authenticated user (must have access to the dashboard).
      db (AsyncSession): Database session.
      accept_language (Optional[str]): Language preference header.

  Returns:
      DashboardResponse: The newly created dashboard populated with cloned widgets.
  """
  # 1. Fetch Source with Access Check
  source_dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  # 2. Create Destination Dashboard
  new_dashboard = Dashboard(name=f"Copy of {source_dashboard.name}", owner_id=current_user.id)
  db.add(new_dashboard)
  # Flush to generate ID for widget foreign keys
  await db.flush()

  # 3. Clone Widgets (Deep Copy of Config)
  # We use copy.deepcopy on the config dictionary to ensure no shared references
  # between the old and new widget if the config is mutable in memory.
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

  # 4. Return full object (Reload to get new widgets)
  result = await db.execute(
    select(Dashboard).where(Dashboard.id == new_dashboard.id).options(selectinload(Dashboard.widgets))
  )
  dashboard = result.scalars().first()
  if not dashboard:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cloned dashboard could not be loaded")
  dashboard.permission_level = "OWNER"
  return dashboard


@router.post("/restore-defaults", response_model=DashboardResponse)
async def restore_default_dashboard(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """
  Re-creates the standard 'Hospital Command Center' dashboard.
  If the dashboard already exists, creates a copy with a suffix to prevent data loss.
  Populates the dashboard with all currently active templates in the registry.
  """
  dashboard = await provisioning_service.restore_defaults(db, current_user)
  await db.commit()

  result = await db.execute(
    select(Dashboard).where(Dashboard.id == dashboard.id).options(selectinload(Dashboard.widgets))
  )
  dash = result.scalars().first()
  if not dash:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Default dashboard could not be restored")
  dash.permission_level = "OWNER"
  return dash


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Get a specific dashboard details."""
  dashboard, perm = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )
  dashboard.permission_level = perm
  return dashboard


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
  dashboard_id: UUID,
  dashboard_update: DashboardCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Rename a dashboard."""
  dashboard, perm = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )
  dashboard.name = dashboard_update.name
  await db.commit()
  dashboard.permission_level = perm
  return dashboard


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Delete dashboard (and cascades to widgets and shares). Only owner can delete."""
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )
  await db.delete(dashboard)
  await db.commit()


# --- Widgets ---


@router.post("/{dashboard_id}/widgets", response_model=WidgetResponse)
async def create_widget(
  dashboard_id: UUID,
  widget_in: WidgetCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Add a widget to the dashboard with Dry-Run Validation."""
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language)

  # 2. SQL Validation
  if widget_in.type == "SQL":
    query = widget_in.config.query
    _validate_sql_query(query, accept_language or current_user.language_preference)

  # 3. Creation
  widget = Widget(
    dashboard_id=dashboard_id,
    title=widget_in.title,
    type=widget_in.type,
    visualization=widget_in.visualization,
    config=widget_in.config.model_dump(mode="json"),
  )
  db.add(widget)
  await db.commit()
  return widget


@router.put("/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
  widget_id: UUID,
  widget_in: WidgetUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Update widget configuration (e.g., resize, change query) with Dry-Run."""
  result = await db.execute(select(Widget).where(Widget.id == widget_id))
  widget = result.scalars().first()
  if not widget:
    msg = get_translated_message(
      accept_language or current_user.language_preference, "error.widget_not_found", "Widget not found"
    )
    raise HTTPException(status_code=404, detail=msg)

  await _get_dashboard_with_access(
    widget.dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )

  updating_sql = False
  if widget.type == "SQL" and widget_in.config and "query" in widget_in.config:
    updating_sql = True

  if updating_sql and widget_in.config:
    current_query = widget_in.config["query"]  # New Query
    _validate_sql_query(current_query, accept_language or current_user.language_preference)

  # Update fields
  update_data = widget_in.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(widget, key, value)

  await db.commit()
  return widget


@router.delete("/widgets/{widget_id}", status_code=204)
async def delete_widget(
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
):
  """Delete a widget from a dashboard."""
  result = await db.execute(select(Widget).where(Widget.id == widget_id))
  widget = result.scalars().first()
  if not widget:
    msg = get_translated_message(
      accept_language or current_user.language_preference, "error.widget_not_found", "Widget not found"
    )
    raise HTTPException(status_code=404, detail=msg)

  await _get_dashboard_with_access(
    widget.dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )

  await db.delete(widget)
  await db.commit()


@router.post("/{dashboard_id}/reorder", status_code=200)
async def reorder_widgets(
  dashboard_id: UUID,
  request: WidgetReorderRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> dict:
  """
  Bulk update widget positions and groups.
  Used for Drag-and-Drop persistence.
  """
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language)

  # 2. Fetch all widgets in this dashboard
  result = await db.execute(select(Widget).where(Widget.dashboard_id == dashboard_id))
  widgets_db = {w.id: w for w in result.scalars().all()}

  # 3. Apply updates
  updated_count = 0
  for item in request.items:
    if item.id in widgets_db:
      widget = widgets_db[item.id]

      # We must modify the config dictionary carefully.
      # SQLAlchemy creates a new dict reference if we modify in place for JSONB tracking usually,
      # but explicit assignment is safer.
      new_config = widget.config.copy()
      new_config["order"] = item.order
      if item.group is not None:
        new_config["group"] = item.group

      widget.config = new_config
      updated_count += 1

  await db.commit()
  return {"updated": updated_count}


@router.get("/{dashboard_id}/export")
async def export_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user_from_header_or_query)],
  db: Annotated[AsyncSession, Depends(get_db)],
  format: str = Query("json", pattern="^(json|csv)$"),
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Response:
  """
  Exports dashboard layout, configuration, and data snapshot in JSON or CSV format.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Authenticated user requesting export.
      db (AsyncSession): Database session.
      format (str): Export format ('json' or 'csv').
      accept_language (Optional[str]): Language preference header.

  Returns:
      Response: File download stream with appropriate media type.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in dashboard.name)

  if format == "json":
    export_payload: dict[str, Any] = {
      "dashboard_id": str(dashboard.id),
      "name": dashboard.name,
      "exported_at": datetime.now(UTC).isoformat(),
      "widgets": [],
    }

    conn = duckdb_manager.get_readonly_connection()
    try:
      cursor = conn.cursor()
      for widget in dashboard.widgets:
        data_records: list[dict[str, Any]] = []
        if widget.type == "SQL":
          res = run_sql_widget(cursor, widget.config)
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
    finally:
      conn.close()

    json_str = json.dumps(export_payload, indent=2)
    return Response(
      content=json_str,
      media_type="application/json",
      headers={"Content-Disposition": f'attachment; filename="{safe_title}_export.json"'},
    )

  # CSV Format
  output = io.StringIO()
  writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

  def sanitize_csv_val(val: Any) -> str:
    """
    Sanitizes values against CSV formula injection by prefixing with a single quote.
    """
    s = str(val) if val is not None else ""
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
      return f"'{s}"
    return s

  writer.writerow(["# Dashboard Export", sanitize_csv_val(dashboard.name)])
  writer.writerow(["# Exported At", datetime.now(UTC).isoformat()])
  writer.writerow([])

  conn = duckdb_manager.get_readonly_connection()
  try:
    cursor = conn.cursor()
    for widget in dashboard.widgets:
      writer.writerow([f"## Widget: {widget.title} ({widget.type})"])
      if widget.type == "SQL":
        res = run_sql_widget(cursor, widget.config)
        records = res.get("data", [])
        if records and isinstance(records, list):
          headers = list(records[0].keys())
          writer.writerow([sanitize_csv_val(h) for h in headers])
          for row in records:
            writer.writerow([sanitize_csv_val(row.get(h)) for h in headers])
        elif res.get("error"):
          writer.writerow([f"Error: {res['error']}"])
        else:
          writer.writerow(["No data"])
      writer.writerow([])
  finally:
    conn.close()

  csv_content = output.getvalue()
  return Response(
    content=csv_content,
    media_type="text/csv",
    headers={"Content-Disposition": f'attachment; filename="{safe_title}_export.csv"'},
  )


@router.get("/{dashboard_id}/widgets/{widget_id}/export")
async def export_widget(
  dashboard_id: UUID,
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user_from_header_or_query)],
  db: Annotated[AsyncSession, Depends(get_db)],
  format: str = Query("json", pattern="^(json|csv)$"),
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Response:
  """
  Exports an individual widget configuration and its analytical data snapshot.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      widget_id (UUID): Target widget ID within the dashboard.
      current_user (User): Authenticated user requesting export.
      db (AsyncSession): PostgreSQL async database session.
      format (str): Export format ('json' or 'csv'). Defaults to 'json'.
      accept_language (Optional[str]): Language preference header.

  Returns:
      Response: Streaming file download with appropriate MIME type and Content-Disposition.

  Raises:
      HTTPException: 404 if dashboard or widget not found or access denied.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  widget = next((w for w in dashboard.widgets if w.id == widget_id), None)
  if not widget:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

  safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in widget.title)

  data_records: list[dict[str, Any]] = []
  if widget.type == "SQL":
    conn = duckdb_manager.get_readonly_connection()
    try:
      cursor = conn.cursor()
      res = run_sql_widget(cursor, widget.config)
      data_records = res.get("data", [])
    finally:
      conn.close()

  if format == "json":
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
    return Response(
      content=json.dumps(payload, indent=2),
      media_type="application/json",
      headers={"Content-Disposition": f'attachment; filename="{safe_title}_export.json"'},
    )

  output = io.StringIO()
  writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

  def sanitize_csv_val(val: Any) -> str:
    """
    Sanitizes values against CSV formula injection by prefixing with a single quote.

    Args:
        val (Any): The raw cell value.

    Returns:
        str: Formula-safe string representation.
    """
    s = str(val) if val is not None else ""
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
      return f"'{s}"
    return s

  writer.writerow(["# Widget Export", sanitize_csv_val(widget.title)])
  writer.writerow(["# Type", widget.type])
  writer.writerow(["# Exported At", datetime.now(UTC).isoformat()])
  writer.writerow([])

  if data_records and isinstance(data_records, list):
    headers = list(data_records[0].keys())
    writer.writerow([sanitize_csv_val(h) for h in headers])
    for row in data_records:
      writer.writerow([sanitize_csv_val(row.get(h)) for h in headers])
  else:
    writer.writerow(["No data"])

  return Response(
    content=output.getvalue(),
    media_type="text/csv",
    headers={"Content-Disposition": f'attachment; filename="{safe_title}_export.csv"'},
  )


@router.get("/{dashboard_id}/export/pdf")
async def export_dashboard_pdf(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user_from_header_or_query)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Response:
  """
  Exports dashboard layout, clinical metadata, and data snapshot formatted as a PDF report.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Authenticated user requesting export.
      db (AsyncSession): Database session.
      accept_language (Optional[str]): Language preference header.

  Returns:
      Response: Binary stream formatted as an application/pdf document.
  """
  from app.services.pdf_export import generate_clinical_pdf_report

  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in dashboard.name)

  widgets_data: list[dict[str, Any]] = []
  conn = duckdb_manager.get_readonly_connection()
  try:
    cursor = conn.cursor()
    for widget in dashboard.widgets:
      w_info: dict[str, Any] = {
        "title": widget.title,
        "type": widget.type,
        "data": [],
        "error": None,
      }
      if widget.type == "SQL":
        res = run_sql_widget(cursor, widget.config)
        w_info["data"] = res.get("data", [])
        w_info["error"] = res.get("error")
      widgets_data.append(w_info)
  finally:
    conn.close()

  pdf_bytes = generate_clinical_pdf_report(
    dashboard_name=dashboard.name,
    author_email=current_user.email,
    widgets_data=widgets_data,
  )

  return Response(
    content=pdf_bytes,
    media_type="application/pdf",
    headers={"Content-Disposition": f'attachment; filename="{safe_title}_clinical_report.pdf"'},
  )


# --- Sharing ---


@router.post("/{dashboard_id}/shares", response_model=DashboardShareResponse)
async def share_dashboard(
  dashboard_id: UUID,
  share_in: DashboardShareCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> DashboardShareResponse:
  """
  Shares a dashboard with another user by email. Only the dashboard owner can share.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      share_in (DashboardShareCreate): Email and permission level ('VIEW' or 'EDIT').
      current_user (User): Authenticated user (must be owner).
      db (AsyncSession): Database session.
      accept_language (Optional[str]): Language preference header.

  Returns:
      DashboardShareResponse: Details of created or updated share.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )

  # Look up target user
  user_stmt = select(User).where(User.email == share_in.user_email)
  target_user = (await db.execute(user_stmt)).scalars().first()
  if not target_user:
    raise HTTPException(status_code=404, detail="Target user not found")

  if target_user.id == current_user.id:
    raise HTTPException(status_code=400, detail="Cannot share dashboard with yourself")

  perm = share_in.permission_level.upper()
  if perm not in ("VIEW", "EDIT"):
    raise HTTPException(status_code=400, detail="Permission level must be VIEW or EDIT")

  # Upsert share
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

  return DashboardShareResponse(
    id=share.id,
    dashboard_id=share.dashboard_id,
    user_id=target_user.id,
    user_email=target_user.email,
    permission_level=share.permission_level,
  )


@router.get("/{dashboard_id}/shares", response_model=list[DashboardShareResponse])
async def list_dashboard_shares(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> list[DashboardShareResponse]:
  """
  Lists all active shares on a dashboard. Accessible to owners and collaborators.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Authenticated user with access.
      db (AsyncSession): Database session.
      accept_language (Optional[str]): Language preference header.

  Returns:
      List[DashboardShareResponse]: List of active shares.
  """
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language)

  stmt = (
    select(DashboardShare, User.email)
    .join(User, DashboardShare.user_id == User.id)
    .where(DashboardShare.dashboard_id == dashboard_id)
  )
  res = await db.execute(stmt)
  shares_list = []
  for share, email in res.all():
    shares_list.append(
      DashboardShareResponse(
        id=share.id,
        dashboard_id=share.dashboard_id,
        user_id=share.user_id,
        user_email=email,
        permission_level=share.permission_level,
      )
    )
  return shares_list


@router.delete("/{dashboard_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard_share(
  dashboard_id: UUID,
  share_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> None:
  """
  Revokes a dashboard share. Only the dashboard owner can revoke shares.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      share_id (UUID): Specific share record ID to delete.
      current_user (User): Authenticated owner.
      db (AsyncSession): Database session.
      accept_language (Optional[str]): Language preference header.
  """
  await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )

  stmt = select(DashboardShare).where(and_(DashboardShare.id == share_id, DashboardShare.dashboard_id == dashboard_id))
  share = (await db.execute(stmt)).scalars().first()
  if not share:
    raise HTTPException(status_code=404, detail="Share not found")

  await db.delete(share)
  await db.commit()
