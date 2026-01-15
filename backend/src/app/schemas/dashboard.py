"""
Dashboard Domain Schemas.

Defines the Data Transfer Objects (DTOs) for Dashboards.
Integrates the strict polymorphic `WidgetCreate` definition from the widget module.
"""

from typing import List, Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict

# Import the strict definition
from app.schemas.widget import WidgetCreate, WidgetUpdate


class WidgetBase(BaseModel):
  """
  Base properties for a Widget.
  Used for shared attribute definitions if needed.
  """

  title: str
  type: str
  visualization: str
  config: Dict[str, Any]


class WidgetResponse(WidgetBase):
  """
  API Response model for a persisted Widget.
  """

  id: UUID
  dashboard_id: UUID

  model_config = ConfigDict(from_attributes=True)


# --- Dashboard Schemas ---


class DashboardBase(BaseModel):
  """Shared Dashboard properties."""

  name: str


class DashboardCreate(DashboardBase):
  """Payload for creating a Dashboard."""

  pass


class DashboardResponse(DashboardBase):
  """
  API Response model for a Dashboard.
  Includes the nested list of Widgets.
  """

  id: UUID
  owner_id: UUID
  widgets: List[WidgetResponse] = []

  model_config = ConfigDict(from_attributes=True)
