"""
Provisioning Service.

This module orchestrates the initialization of user environments.
It serves as the bridge between the Template Registry and the User's personal dashboard,
automatically instantiating specific widgets based on the 'Standard Content Pack'.

It handles:
1. New User Registration (Default Dashboard).
2. Restore Defaults (Re-creating the default dashboard on demand).
"""

import uuid
import logging
import re
from typing import List, Dict, Any, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate
from app.models.user import User

logger = logging.getLogger("provisioning")


class ProvisioningService:
  """
  Service responsible for creating default asset structures for users.
  """

  DEFAULT_DASHBOARD_NAME = "Hospital Command Center"

  async def provision_new_user(self, db: AsyncSession, user: User) -> None:
    """
    Creates the default 'Hospital Command Center' dashboard for a new user.
    This is called during the Registration transaction.

    Args:
        db (AsyncSession): The active database session.
        user (User): The newly created user entity.
    """
    logger.info(f"Starting initial provisioning for user: {user.id}")
    await self._create_dashboard_from_templates(db, user, self.DEFAULT_DASHBOARD_NAME)

  async def restore_defaults(self, db: AsyncSession, user: User) -> Dashboard:
    """
    Re-creates the default dashboard for an existing user.
    Handles name collisions by appending '(Restored)' or version numbers to prevent data loss.

    Args:
        db (AsyncSession): The active database session.
        user (User): The authenticated user requesting the restore.

    Returns:
        Dashboard: The newly created dashboard entity.
    """
    logger.info(f"Restoring defaults for user: {user.id}")

    # 1. Determine safe name
    target_name = await self._get_safe_dashboard_name(db, user.id, self.DEFAULT_DASHBOARD_NAME)

    # 2. Create logic
    dashboard = await self._create_dashboard_from_templates(db, user, target_name)
    return dashboard

  async def _get_safe_dashboard_name(self, db: AsyncSession, user_id: uuid.UUID, base_name: str) -> str:
    """
    Calculates a non-conflicting name for the new dashboard.
    E.g. "Hospital Command Center" -> "Hospital Command Center (Restored)" -> "Hospital Command Center (Restored 1)"

    Args:
        db (AsyncSession): Database session.
        user_id (uuid.UUID): Owner ID.
        base_name (str): The desired starting name.

    Returns:
        str: A unique name.
    """
    # Check exact match first
    query = select(Dashboard).where(Dashboard.owner_id == user_id, Dashboard.name == base_name)
    result = await db.execute(query)
    if not result.scalars().first():
      return base_name

    # If base exists, try "(Restored)"
    restored_base = f"{base_name} (Restored)"
    query = select(Dashboard).where(Dashboard.owner_id == user_id, Dashboard.name == restored_base)
    result = await db.execute(query)
    if not result.scalars().first():
      return restored_base

    # If that exists, find the highest suffix number
    # Pattern: "Name (Restored X)"
    pattern = f"{base_name} (Restored %)%"
    query = select(Dashboard.name).where(Dashboard.owner_id == user_id, Dashboard.name.like(pattern))
    result = await db.execute(query)
    existing_names = result.scalars().all()

    max_suffix = 0
    # Match: "Name (Restored 1)"
    regex = re.compile(rf"{re.escape(base_name)} \(Restored (\d+)\)")

    for name in existing_names:
      match = regex.fullmatch(name)
      if match:
        max_suffix = max(max_suffix, int(match.group(1)))

    return f"{base_name} (Restored {max_suffix + 1})"

  async def _create_dashboard_from_templates(self, db: AsyncSession, user: User, title: str) -> Dashboard:
    """
    Internal helper to instantiate a dashboard and populate it with widgets from the Template Registry.

    Args:
        db (AsyncSession): Database session.
        user (User): Owner.
        title (str): The final determined name for the dashboard.

    Returns:
        Dashboard: The created entity (added to session, not committed).
    """
    # 1. Create Dashboard Header
    dashboard_id = uuid.uuid4()
    dashboard = Dashboard(id=dashboard_id, name=title, owner_id=user.id)
    db.add(dashboard)

    # 2. Fetch Templates
    query = select(WidgetTemplate).order_by(WidgetTemplate.category, WidgetTemplate.title)
    result = await db.execute(query)
    templates: List[WidgetTemplate] = result.scalars().all()

    if not templates:
      logger.warning("No templates found during provisioning.")
      return dashboard  # Return empty dashboard

    # 3. Instantiate Widgets
    for idx, template in enumerate(templates):
      # Layout Strategy: 2 Column Grid (Width 6 per widget)
      widgets_per_row = 2
      col_width = 6

      row_index = idx // widgets_per_row
      col_index = (idx % widgets_per_row) * col_width

      viz_type = self._determine_visual_type(template)
      config = self._build_config(template, viz_type)

      # Inject Layout
      config["x"] = col_index
      config["y"] = row_index * 4
      config["w"] = col_width
      config["h"] = 4

      widget = Widget(
        id=uuid.uuid4(),
        dashboard_id=dashboard_id,
        title=template.title,
        type="SQL",
        visualization=viz_type,
        config=config,
      )
      db.add(widget)

    logger.info(f"Provisioned dashboard '{title}' with {len(templates)} widgets.")
    return dashboard

  def _determine_visual_type(self, template: WidgetTemplate) -> str:
    """
    Heuristic algorithm to guess the best visualization based on the query semantics.

    Args:
        template (WidgetTemplate): The source template.

    Returns:
        str: The visualization ID (e.g., 'metric', 'bar_chart', 'table').
    """
    sql_lower = template.sql_template.lower()
    title_lower = template.title.lower()

    # 1. Scalar / Single Number -> Metric
    if "probability" in title_lower or "rate" in title_lower or "growth" in title_lower:
      if "group by" not in sql_lower:
        return "metric"

    # 2. Trends / Time Series -> Chart
    if "over time" in title_lower or "daily" in title_lower or "monthly" in title_lower:
      return "bar_chart"

    # 3. Distributions -> Pie
    if "breakdown" in title_lower or "share" in title_lower:
      return "pie"

    # 4. Comparisons -> Bar Chart
    if "compare" in title_lower or "versus" in title_lower:
      return "bar_chart"

    return "table"

  def _build_config(self, template: WidgetTemplate, viz_type: str) -> Dict[str, Any]:
    """
    Constructs the widget configuration object.
    Injects default parameter values into the SQL to ensure it executes without user input.

    Args:
        template (WidgetTemplate): The source template.
        viz_type (str): The determined visualization type.

    Returns:
        Dict[str, Any]: Configuration dictionary for the Widget model.
    """
    raw_sql = template.sql_template
    params_schema = template.parameters_schema or {}
    properties = params_schema.get("properties", {})

    # Replace handlebars {{ var }} with default values from schema
    processed_sql = raw_sql
    for key, prop_def in properties.items():
      if "default" in prop_def:
        default_val = prop_def["default"]
        # Must handle string quotes for SQL
        if isinstance(default_val, str):
          clean_val = str(default_val).replace("'", "''")
          processed_sql = processed_sql.replace(f"{{{{{key}}}}}", str(clean_val))
          processed_sql = processed_sql.replace(f"{{{{ {key} }}}}", str(clean_val))
        else:
          processed_sql = processed_sql.replace(f"{{{{{key}}}}}", str(default_val))
          processed_sql = processed_sql.replace(f"{{{{ {key} }}}}", str(default_val))

    config = {"query": processed_sql}
    return config


# Singleton Instance
provisioning_service = ProvisioningService()
