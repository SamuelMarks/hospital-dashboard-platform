"""
Dashboards API Router.

Handles CRUD operations for Dashboards and Widgets.
Allows users to create, list, update, and delete their analytics workspaces.
Also provides the ability to restore the default content pack and clone existing dashboards.
"""

import copy
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.database.postgres import get_db
from app.database.duckdb import duckdb_manager
from app.models.user import User
from app.models.dashboard import Dashboard, Widget
from app.schemas.dashboard import (
  DashboardCreate,
  DashboardResponse,
  WidgetCreate,
  WidgetResponse,
  WidgetUpdate,
  WidgetReorderRequest,
)
from app.services.provisioning import provisioning_service

router = APIRouter()

# --- Validation Helper ---


def _validate_sql_query(query: str) -> None:
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

  try:
    # Use readonly connection to safely test validity
    conn = duckdb_manager.get_readonly_connection()
    # PREPARE parses and binds the query. If table missing or syntax wrong, it raises.
    conn.execute(f"PREPARE v AS {query}")
    # Cleanup
    conn.execute("DEALLOCATE v")
    conn.close()
  except Exception as e:
    # Extract the specific DuckDB error message
    error_msg = str(e).split("\n")[0]  # First line usually contains the core reason
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"Invalid SQL Query: {error_msg}",
    )


# --- Dashboards ---


@router.get("/", response_model=List[DashboardResponse])
async def list_dashboards(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """List all dashboards owned by the current user."""
  result = await db.execute(
    select(Dashboard).where(Dashboard.owner_id == current_user.id).options(selectinload(Dashboard.widgets))
  )
  return result.scalars().all()


@router.post("/", response_model=DashboardResponse)
async def create_dashboard(
  dashboard_in: DashboardCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Create a new empty dashboard."""
  dashboard = Dashboard(name=dashboard_in.name, owner_id=current_user.id)
  db.add(dashboard)
  await db.commit()
  await db.refresh(dashboard)
  return dashboard


@router.post("/{dashboard_id}/clone", response_model=DashboardResponse)
async def clone_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """
  Creates a deep copy of an existing dashboard and all its widgets.
  The new dashboard will have the name "Copy of {original_name}".

  Args:
      dashboard_id (UUID): The ID of the dashboard to clone.
      current_user (User): Authenticated user (must own the dashboard).
      db (AsyncSession): Database session.

  Returns:
      DashboardResponse: The newly created dashboard populated with cloned widgets.
  """
  # 1. Fetch Source with Widgets
  result = await db.execute(
    select(Dashboard)
    .where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id)
    .options(selectinload(Dashboard.widgets))
  )
  source_dashboard = result.scalars().first()

  if not source_dashboard:
    raise HTTPException(status_code=404, detail="Dashboard not found")

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
  return result.scalars().first()


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
  await db.refresh(dashboard)
  return dashboard


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Get a specific dashboard details."""
  result = await db.execute(
    select(Dashboard)
    .where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id)
    .options(selectinload(Dashboard.widgets))
  )
  dashboard = result.scalars().first()
  if not dashboard:
    raise HTTPException(status_code=404, detail="Dashboard not found")
  return dashboard


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
  dashboard_id: UUID,
  dashboard_update: DashboardCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Rename a dashboard."""
  result = await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id))
  dashboard = result.scalars().first()
  if not dashboard:
    raise HTTPException(status_code=404, detail="Dashboard not found")

  dashboard.name = dashboard_update.name
  await db.commit()
  await db.refresh(dashboard)
  return dashboard


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(
  dashboard_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Delete dashboard (and cascades to widgets)."""
  result = await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id))
  dashboard = result.scalars().first()
  if not dashboard:
    raise HTTPException(status_code=404, detail="Dashboard not found")

  await db.delete(dashboard)
  await db.commit()
  return None


# --- Widgets ---


@router.post("/{dashboard_id}/widgets", response_model=WidgetResponse)
async def create_widget(
  dashboard_id: UUID,
  widget_in: WidgetCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Add a widget to the dashboard with Dry-Run Validation."""
  # 1. Ownership Check
  result = await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id))
  if not result.scalars().first():
    raise HTTPException(status_code=404, detail="Dashboard not found")

  # 2. SQL Validation
  if widget_in.type == "SQL":
    query = widget_in.config.query
    _validate_sql_query(query)

  # 3. Creation
  widget = Widget(
    dashboard_id=dashboard_id,
    title=widget_in.title,
    type=widget_in.type,
    visualization=widget_in.visualization,
    config=widget_in.config.model_dump(),
  )
  db.add(widget)
  await db.commit()
  await db.refresh(widget)
  return widget


@router.put("/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
  widget_id: UUID,
  widget_in: WidgetUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Update widget configuration (e.g., resize, change query) with Dry-Run."""
  result = await db.execute(
    select(Widget).join(Dashboard).where(Widget.id == widget_id, Dashboard.owner_id == current_user.id)
  )
  widget = result.scalars().first()
  if not widget:
    raise HTTPException(status_code=404, detail="Widget not found")

  updating_sql = False
  if widget.type == "SQL" and widget_in.config and "query" in widget_in.config:
    updating_sql = True

  if updating_sql:
    current_query = widget_in.config["query"]  # New Query
    _validate_sql_query(current_query)

  # Update fields
  update_data = widget_in.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(widget, key, value)

  await db.commit()
  await db.refresh(widget)
  return widget


@router.delete("/widgets/{widget_id}", status_code=204)
async def delete_widget(
  widget_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
):
  """Delete a widget owned by the current user."""
  result = await db.execute(
    select(Widget).join(Dashboard).where(Widget.id == widget_id, Dashboard.owner_id == current_user.id)
  )
  widget = result.scalars().first()
  if not widget:
    raise HTTPException(status_code=404, detail="Widget not found")

  await db.delete(widget)
  await db.commit()
  return None


@router.post("/{dashboard_id}/reorder", status_code=200)
async def reorder_widgets(
  dashboard_id: UUID,
  request: WidgetReorderRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
  """
  Bulk update widget positions and groups.
  Used for Drag-and-Drop persistence.
  """
  # 1. Verify Dashboard Ownership
  result = await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id, Dashboard.owner_id == current_user.id))
  if not result.scalars().first():
    raise HTTPException(status_code=404, detail="Dashboard not found")

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
