"""
Provisioning Service.

This module orchestrates the initialization of user environments upon registration.
It serves as the bridge between the Template Registry and the User's personal dashboard,
automatically instantiating specific widgets based on the 'Standard Content Pack'.
"""

import uuid
import logging
from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate
from app.models.user import User

logger = logging.getLogger("provisioning")


class ProvisioningService:
  """
  Service responsible for creating default asset structures for new users.
  """

  async def provision_new_user(self, db: AsyncSession, user: User) -> None:
    """
    Creates a default 'Hospital Command Center' dashboard and populates it with
    widgets derived from the global template registry.

    This method should be called within the registration transaction context
    to ensure atomicity (User + Dashboard + Widgets commit together).

    Args:
        db (AsyncSession): The active database session.
        user (User): The newly created user entity (must have an ID, even if not committed).
    """
    logger.info(f"Starting provisioning for user: {user.email}")

    # 1. Create the Default Dashboard
    dashboard_id = uuid.uuid4()
    dashboard = Dashboard(id=dashboard_id, name="Hospital Command Center", owner_id=user.id)
    db.add(dashboard)

    # 2. Fetch All Available Templates
    # We order by category to group similar widgets together visually
    query = select(WidgetTemplate).order_by(WidgetTemplate.category, WidgetTemplate.title)
    result = await db.execute(query)
    templates: List[WidgetTemplate] = result.scalars().all()

    if not templates:
      logger.warning("No templates found in registry. Dashboard will be empty.")
      return

    # 3. Instantiate Widgets
    # Layout Strategy: 2 Column Grid (Width 6 per widget)
    # Allows for readable charts and tables on standard screens.
    valid_widgets = 0

    for idx, template in enumerate(templates):
      # Calculate Grid Position
      # Grid system is 12-column. w=6 means 2 widgets per row.
      widgets_per_row = 2
      col_width = 6

      row_index = idx // widgets_per_row
      col_index = (idx % widgets_per_row) * col_width

      # Determine suitable visualization
      viz_type = self._determine_visual_type(template)

      # Inject default values for variables to ensure widget is runnable immediately
      # E.g., {{ unit_name }} -> 'ICU'
      config = self._build_config(template, viz_type)
      config["x"] = col_index
      config["y"] = row_index * 4  # Height unit is roughly 1 row height
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
      valid_widgets += 1

    logger.info(f"Provisioned {valid_widgets} widgets for Dashboard {dashboard_id}.")

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
    # Checks for singular probability or extremely focused queries
    if "probability" in title_lower or "rate" in title_lower or "growth" in title_lower:
      # If it groups by something, it's a chart, otherwise it might be a single KPI
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

    # Default fallback for complex datasets
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
          clean_val = str(default_val).replace("'", "''")  # Basic escape
          # Usually template placeholders don't have quotes in SQL, so we just inject
          # Note: Our templates assume {{var}} is injected directly.
          # If var is string, logic usually handles it or SQL has quotes around {{var}}.
          # For safety in this MVP, we assume SQL handles quotes: "WHERE x = '{{var}}'"
          processed_sql = processed_sql.replace(f"{{{{{key}}}}}", str(clean_val))
          # Also support spacing {{ key }}
          processed_sql = processed_sql.replace(f"{{{{ {key} }}}}", str(clean_val))
        else:
          # Numbers/Ints directly
          processed_sql = processed_sql.replace(f"{{{{{key}}}}}", str(default_val))
          processed_sql = processed_sql.replace(f"{{{{ {key} }}}}", str(default_val))

    config = {"query": processed_sql}

    # Add Visualization Hints
    if viz_type == "bar_chart":
      # Simple heuristic for X/Y keys if not mapped manually
      # This relies on the convention that first column is dimension, second is measure
      pass

    return config


# Singleton Instance
provisioning_service = ProvisioningService()
