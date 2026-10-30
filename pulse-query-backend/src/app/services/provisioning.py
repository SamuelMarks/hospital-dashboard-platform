"""
Provisioning Service.

This module orchestrates the initialization of user environments.
It serves as the bridge between the Template Registry and the User's personal dashboard,
automatically instantiating specific widgets based on the 'Standard Content Pack'.

It handles:
1. New User Registration (Default Dashboard).
2. Restore Defaults (Re-creating the default dashboard on demand).
"""

import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate
from app.models.user import User
from app.schemas.json_types import JsonObject
from app.services.sql_utils import interpolate_template_parameters

logger = logging.getLogger(__name__)


class ProvisioningService:
  """
  Service responsible for creating default asset structures for users.
  """

  DEFAULT_DASHBOARD_NAME = "Hospital Command Center"

  DEFAULT_WIDGET_BLUEPRINTS: dict[str, str] = {
    "Capacity Forecasting": "7-day Simple Moving Average (SMA) forecast of unit census to anticipate capacity surges.",
    "Elective Impact": "Correlation between Monday elective surgical volume and Wednesday inpatient bed scarcity.",
    "Predictive Availability": "Probability of open bed availability on target future days given high current utilization.",
    "Utilization Spikes": "Consecutive 3-day windows where unit census exceeded 100% of staffed bed capacity.",
    "Weekend Effect": "Comparison of Average Length of Stay (ALOS) for Friday/Saturday admissions versus Tuesday.",
    "Admission Lag": "Average hours elapsed between Emergency Room admission and first Midnight Census appearance.",
    "Bottleneck Analysis": "Clinical services and hours of day where inpatient admissions outpace discharges.",
    "Long-Stayers": "Percentage of total hospital bed-days consumed by length-of-stay outliers (>2 SD above mean).",
    "Paired Bottlenecks": "Dates where competing clinical wards simultaneously reached 100% capacity.",
    "Throughput Velocity": "Daily patient churn (combined admissions and discharges) across high-volume units.",
    "The 'NICU Cliff'": "Probability that a newborn staying beyond 48 hours transitions into a >10-day long stay.",
    "Maternity-Nursery Link": "Synchronization risk measuring likelihood that Nursery is >90% full when Maternity is >90% full.",
    "Cohort Isolation": "Daily census comparison between Emergency Room and Physician Referral admission pathways.",
    "Discharge Efficiency": "Average delay in minutes after 8:00 AM until the first bed is vacated on full-capacity days.",
    "Weekend Discharge Lag": "Probability of exceeding target Length of Stay for weekend versus weekday discharges.",
    "Bed Turnover Time": "Average turnaround time in minutes between a unit discharge and the subsequent admission.",
    "Step-Down Availability": "Likelihood that PCU step-down beds are open when the ICU reaches maximum capacity.",
    "Step-Down Flow": "Average hours patients spend in the ICU prior to step-down transfer to a PCU ward.",
    "Midnight vs. Noon": "Comparison of official Midnight Census against active 12:00 PM Noon patient load.",
    "The '2 AM' Indicator": "Overstay risk comparison between overnight (00:00-05:00) and standard daytime admissions.",
    "Overflow Predictor": "Probability that a patient is boarded off-service when their primary specialty unit is full.",
    "Wait-list Probability": "Historical likelihood that a target unit reaches 100% capacity on a given day of the week.",
    "Conditional Overstay Risk": "Conditional probability that a patient staying X days remains hospitalized at least Y days.",
    "Service-Adjusted LoS": "Overstay risk (>120% of service median LoS) stratified by patient entry point.",
    "Clinical Service 'Rent'": "Total inpatient bed-hours consumed by each clinical service within mixed-acuity units.",
    "Day-of-Week Volatility": "Units ranked by daily census standard deviation and variance index to guide flexible staffing.",
    "Holiday Decompression": "Days required for hospital census to return to baseline following a major holiday.",
    "Seasonal Growth": "Month-over-month percentage change in inpatient census for the selected clinical service.",
    "Service Dominance": "Proportional share of clinical services occupying beds within mixed-acuity units.",
    "Shift Change Stress": "Inpatient units experiencing the highest volume of discharges during the 6:00 PM - 8:00 PM handover.",
  }

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
    return await self._create_dashboard_from_templates(db, user, target_name)

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
    pattern = f"{base_name} (Restored %)%"
    name_query = select(Dashboard.name).where(Dashboard.owner_id == user_id, Dashboard.name.like(pattern))
    name_result = await db.execute(name_query)
    existing_names = name_result.scalars().all()

    max_suffix = 0
    regex = re.compile(rf"{re.escape(base_name)} \(Restored (\d+)\)")

    for name in existing_names:
      match = regex.fullmatch(str(name))
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
    templates = list(result.scalars().all())

    if not templates:
      logger.warning("No templates found during provisioning.")
      return dashboard  # Return empty dashboard

    # 3. Instantiate Widgets
    current_y = 0
    row_height = 4
    for idx, template in enumerate(templates):
      # Layout Strategy: 2 Column Grid (Width 6 per widget)
      widgets_per_row = 2
      col_width = 6

      col_index = (idx % widgets_per_row) * col_width

      viz_type = self._determine_visual_type(template)
      config = self._build_config(template, viz_type)
      widget_h = 6 if viz_type == "table" else (5 if viz_type in ("bar_chart", "pie") else 4)
      row_height = widget_h if idx % widgets_per_row == 0 else max(row_height, widget_h)

      # Inject Layout
      config["x"] = col_index
      config["y"] = current_y
      config["w"] = col_width
      config["h"] = widget_h
      config["order"] = idx

      if idx % widgets_per_row == widgets_per_row - 1:
        current_y += row_height

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
    if ("probability" in title_lower or "rate" in title_lower or "growth" in title_lower) and (
      "group by" not in sql_lower
    ):
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

  def _build_config(self, template: WidgetTemplate, viz_type: str) -> JsonObject:
    """
    Constructs the widget configuration dictionary.
    Injects default parameter values into the SQL to ensure it executes without user input,
    and attaches a descriptive subtitle/caption when available.

    Args:
        template (WidgetTemplate): The source template.
        viz_type (str): The determined visualization type.

    Returns:
        JsonObject: Configuration dictionary for the Widget model.
    """
    _ = viz_type
    processed_sql = interpolate_template_parameters(
      template.sql_template,
      template.parameters_schema if isinstance(template.parameters_schema, dict) else None,
    )
    config: JsonObject = {"query": processed_sql}
    subtitle = self.DEFAULT_WIDGET_BLUEPRINTS.get(template.title) or (
      template.description.strip() if isinstance(template.description, str) and template.description.strip() else None
    )
    if subtitle:
      config["subtitle"] = subtitle
      config["description"] = subtitle
    return config


# Singleton Instance
provisioning_service = ProvisioningService()
