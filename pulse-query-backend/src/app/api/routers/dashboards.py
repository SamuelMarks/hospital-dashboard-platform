"""
Dashboards API Router.

Handles CRUD operations for Dashboards, Widgets, Collaborator Shares, and Exports
by delegating domain logic to `DashboardService`.
"""

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.schemas.dashboard import (
  DashboardCreate,
  DashboardResponse,
  DashboardShareCreate,
  DashboardShareResponse,
  WidgetReorderRequest,
  WidgetResponse,
)
from app.schemas.widget import WidgetCreate, WidgetUpdate
from app.services.dashboard_service import dashboard_service
from app.services.runners.sql import run_sql_widget

router = APIRouter()


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
      accept_language (str | None): Language preference.

  Returns:
      tuple[Dashboard, str]: The dashboard and the resolved permission level ('OWNER', 'EDIT', 'VIEW').
  """
  res = await dashboard_service.get_dashboard_with_access_result(
    dashboard_id=dashboard_id,
    current_user=current_user,
    db=db,
    required_level=required_level,
    accept_language=accept_language,
  )
  return unwrap_or_raise_http(res)


_get_dashboard_with_access = get_dashboard_with_access


def _validate_sql_query(query: str, accept_language: str | None = None) -> None:
  """
  Performs a 'Dry Run' of the SQL query using DuckDB's PREPARE statement.

  Args:
      query (str): The raw SQL string.
      accept_language (str | None): Optional HTTP `Accept-Language` header for localized error messages.
  """
  res = dashboard_service.validate_sql_query_result(
    query,
    accept_language=accept_language,
    conn_factory=duckdb_manager.get_readonly_connection,
  )
  unwrap_or_raise_http(res)


@router.get("/", response_model=list[DashboardResponse])
@router.get("", response_model=list[DashboardResponse])
async def list_dashboards(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Dashboard]:
  """
  Lists all dashboards owned by or shared with the current user.

  Args:
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      list[Dashboard]: List of accessible dashboards.
  """
  return await dashboard_service.list_user_dashboards(current_user, db)


@router.post("/", response_model=DashboardResponse)
async def create_dashboard(
  dashboard_in: DashboardCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Dashboard:
  """
  Creates a new empty dashboard.

  Args:
      dashboard_in (DashboardCreate): Dashboard creation payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Dashboard: Newly created dashboard.
  """
  res = await dashboard_service.create_dashboard_result(dashboard_in, current_user, db)
  return unwrap_or_raise_http(res)


@router.post("/{dashboard_id}/clone", response_model=DashboardResponse)
async def clone_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Dashboard:
  """
  Creates a deep copy of an existing dashboard and all its widgets.

  Args:
      dashboard_id (UUID): The ID of the dashboard to clone.
      current_user (User): Authenticated user.
      db (AsyncSession): Database session.
      accept_language (str | None): Language preference header.

  Returns:
      Dashboard: Newly cloned dashboard.
  """
  source_dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )
  res = await dashboard_service.clone_dashboard_result(source_dashboard, current_user, db)
  return unwrap_or_raise_http(res)


@router.post("/restore-defaults", response_model=DashboardResponse)
async def restore_default_dashboard(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Dashboard:
  """
  Re-creates the standard 'Hospital Command Center' dashboard.

  Args:
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Dashboard: Restored default dashboard.
  """
  res = await dashboard_service.restore_default_dashboard_result(current_user, db)
  return unwrap_or_raise_http(res)


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Dashboard:
  """
  Gets details for a specific dashboard.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.

  Returns:
      Dashboard: Authorized dashboard model.
  """
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
) -> Dashboard:
  """
  Renames an existing dashboard.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      dashboard_update (DashboardCreate): Updated name payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.

  Returns:
      Dashboard: Updated dashboard model.
  """
  dashboard, perm = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )
  res = await dashboard_service.update_dashboard_result(dashboard, perm, dashboard_update, db)
  return unwrap_or_raise_http(res)


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> None:
  """
  Deletes a dashboard (cascading to widgets and shares). Only the owner can delete.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      current_user (User): Authenticated owner.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )
  res = await dashboard_service.delete_dashboard_result(dashboard, db)
  unwrap_or_raise_http(res)


@router.post("/{dashboard_id}/widgets", response_model=WidgetResponse)
async def create_widget(
  dashboard_id: UUID,
  widget_in: WidgetCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Widget:
  """
  Adds a widget to the dashboard with dry-run SQL validation.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      widget_in (WidgetCreate): Polymorphic widget creation payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.

  Returns:
      Widget: Created widget model.
  """
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language)
  res = await dashboard_service.create_widget_result(
    dashboard_id=dashboard_id,
    widget_in=widget_in,
    current_user=current_user,
    db=db,
    accept_language=accept_language,
    conn_factory=duckdb_manager.get_readonly_connection,
  )
  return unwrap_or_raise_http(res)


@router.put("/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
  widget_id: UUID,
  widget_in: WidgetUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> Widget:
  """
  Updates widget configuration (e.g., resize, change query) with dry-run SQL validation.

  Args:
      widget_id (UUID): Target widget ID.
      widget_in (WidgetUpdate): Partial widget update payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.

  Returns:
      Widget: Updated widget model.
  """
  widget = unwrap_or_raise_http(
    await dashboard_service.get_widget_by_id_result(widget_id, current_user, db, accept_language=accept_language)
  )
  await _get_dashboard_with_access(
    widget.dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )
  res = await dashboard_service.update_widget_result(
    widget=widget,
    widget_in=widget_in,
    current_user=current_user,
    db=db,
    accept_language=accept_language,
    conn_factory=duckdb_manager.get_readonly_connection,
  )
  return unwrap_or_raise_http(res)


@router.delete("/widgets/{widget_id}", status_code=204)
async def delete_widget(
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> None:
  """
  Deletes a widget from a dashboard.

  Args:
      widget_id (UUID): Target widget ID.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.
  """
  widget = unwrap_or_raise_http(
    await dashboard_service.get_widget_by_id_result(widget_id, current_user, db, accept_language=accept_language)
  )
  await _get_dashboard_with_access(
    widget.dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language
  )
  res = await dashboard_service.delete_widget_result(widget, db)
  unwrap_or_raise_http(res)


@router.post("/{dashboard_id}/reorder", status_code=200)
async def reorder_widgets(
  dashboard_id: UUID,
  request: WidgetReorderRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  accept_language: str | None = Header(None, alias="Accept-Language"),
) -> dict[str, int]:
  """
  Bulk updates widget positions and groups for drag-and-drop persistence.

  Args:
      dashboard_id (UUID): Target dashboard ID.
      request (WidgetReorderRequest): Bulk reorder items.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      accept_language (str | None): Language preference header.

  Returns:
      dict[str, int]: Count of updated widgets.
  """
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="EDIT", accept_language=accept_language)
  return await dashboard_service.reorder_widgets(dashboard_id, request, db)


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
      accept_language (str | None): Language preference header.

  Returns:
      Response: File download stream with appropriate media type.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  content, media_type, filename = await asyncio.to_thread(
    dashboard_service.build_dashboard_export_content,
    dashboard,
    format,
    duckdb_manager.get_readonly_connection,
    run_sql_widget,
  )
  return Response(
    content=content,
    media_type=media_type,
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
      format (str): Export format ('json' or 'csv').
      accept_language (str | None): Language preference header.

  Returns:
      Response: Streaming file download with appropriate MIME type and Content-Disposition.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  widget = unwrap_or_raise_http(dashboard_service.get_dashboard_widget_result(dashboard, widget_id))

  content, media_type, filename = await asyncio.to_thread(
    dashboard_service.build_widget_export_content,
    dashboard,
    widget,
    format,
    duckdb_manager.get_readonly_connection,
    run_sql_widget,
  )
  return Response(
    content=content,
    media_type=media_type,
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
      accept_language (str | None): Language preference header.

  Returns:
      Response: Binary stream formatted as an application/pdf document.
  """
  dashboard, _ = await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language
  )

  pdf_bytes, filename = await dashboard_service.build_dashboard_pdf_async(
    dashboard=dashboard,
    author_email=current_user.email,
    conn_factory=duckdb_manager.get_readonly_connection,
    sql_runner_fn=run_sql_widget,
  )

  return Response(
    content=pdf_bytes,
    media_type="application/pdf",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


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
      accept_language (str | None): Language preference header.

  Returns:
      DashboardShareResponse: Details of created or updated share.
  """
  await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )
  res = await dashboard_service.share_dashboard_result(dashboard_id, share_in, current_user, db)
  return unwrap_or_raise_http(res)


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
      accept_language (str | None): Language preference header.

  Returns:
      list[DashboardShareResponse]: List of active shares.
  """
  await _get_dashboard_with_access(dashboard_id, current_user, db, required_level="VIEW", accept_language=accept_language)
  return await dashboard_service.list_dashboard_shares(dashboard_id, db)


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
      accept_language (str | None): Language preference header.
  """
  await _get_dashboard_with_access(
    dashboard_id, current_user, db, required_level="OWNER", accept_language=accept_language
  )
  res = await dashboard_service.delete_dashboard_share_result(dashboard_id, share_id, db)
  unwrap_or_raise_http(res)
