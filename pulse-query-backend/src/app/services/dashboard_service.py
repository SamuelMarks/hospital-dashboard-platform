"""
Dashboard Service Module.

Encapsulates dashboard CRUD and composes RBAC access policy, widget lifecycle,
collaborator sharing, and JSON/CSV/PDF analytical report export collaborator services
(`DashboardAccessPolicy`, `DashboardWidgetService`, `DashboardShareService`,
`DashboardExportService`).
"""

from __future__ import annotations

import copy
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.user import User
from app.schemas.dashboard import DashboardCreate
from app.services.dashboard_collaborators import (
  ConnFactoryCallable,
  DashboardAccessPolicy,
  DashboardExportService,
  DashboardShareService,
  DashboardWidgetService,
  ExportFormat,
  ExportedReportPayload,
  PermissionLevel,
  PermissionLevelEnum,
  SqlRunnerCallable,
  dashboard_access_policy,
  dashboard_export_service,
  dashboard_share_service,
  dashboard_widget_service,
  sanitize_csv_value,
  sanitize_filename_title,
)
from app.services.provisioning import provisioning_service


class DashboardService:
  """
  Domain service handling `Dashboard` entity lifecycle (`list`, `create`, `clone`,
  `restore_default`, `update`, `delete`) and composing specialized collaborator
  services (`access_policy`, `widget_service`, `share_service`, `export_service`).
  """

  def __init__(
    self,
    access_policy: DashboardAccessPolicy = dashboard_access_policy,
    widget_service: DashboardWidgetService = dashboard_widget_service,
    share_service: DashboardShareService = dashboard_share_service,
    export_service: DashboardExportService = dashboard_export_service,
  ) -> None:
    """
    Initializes `DashboardService` with its specialized collaborator services.

    Args:
        access_policy (DashboardAccessPolicy): Collaborator evaluating dashboard RBAC.
        widget_service (DashboardWidgetService): Collaborator managing widgets and SQL validation.
        share_service (DashboardShareService): Collaborator managing dashboard shares.
        export_service (DashboardExportService): Collaborator generating JSON/CSV/PDF exports.
    """
    self.access_policy = access_policy
    self.widget_service = widget_service
    self.share_service = share_service
    self.export_service = export_service

  async def get_dashboard_with_access_result(
    self,
    dashboard_id: UUID,
    current_user: User,
    db: AsyncSession,
    required_level: PermissionLevel = "VIEW",
    accept_language: str | None = None,
  ) -> AppResult[tuple[Dashboard, str]]:
    """
    Delegates access resolution to `self.access_policy.get_dashboard_with_access_result`.

    Args:
        dashboard_id (UUID): Target dashboard ID.
        current_user (User): Requesting user model instance.
        db (AsyncSession): Active database session.
        required_level (PermissionLevel): Minimum required permission (`VIEW`, `EDIT`, `OWNER`).
        accept_language (str | None): Optional HTTP `Accept-Language` header.

    Returns:
        AppResult[tuple[Dashboard, str]]: `Ok((dashboard, permission_level))` or `Err(AppError)`.
    """
    return await self.access_policy.get_dashboard_with_access_result(
      dashboard_id=dashboard_id,
      current_user=current_user,
      db=db,
      required_level=required_level,
      accept_language=accept_language,
    )

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


dashboard_service = DashboardService()

__all__ = [
  "ConnFactoryCallable",
  "DashboardAccessPolicy",
  "DashboardExportService",
  "DashboardService",
  "DashboardShareService",
  "DashboardWidgetService",
  "ExportFormat",
  "ExportedReportPayload",
  "PermissionLevel",
  "PermissionLevelEnum",
  "SqlRunnerCallable",
  "dashboard_access_policy",
  "dashboard_export_service",
  "dashboard_service",
  "dashboard_share_service",
  "dashboard_widget_service",
  "sanitize_csv_value",
  "sanitize_filename_title",
]
