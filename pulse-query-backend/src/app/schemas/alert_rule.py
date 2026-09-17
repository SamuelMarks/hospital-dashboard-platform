"""
Pydantic schemas for Clinical Alert Rules management.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.alert_rule import AlertSeverity


class AlertRuleBase(BaseModel):
  """
  Base attributes shared across Alert Rule requests and responses.

  Attributes:
      unit_category (str): Target hospital unit or department category.
      threshold_percentage (float): Bed occupancy percentage threshold (1.0 - 100.0).
      severity (AlertSeverity): Severity classification of the alert.
      is_active (bool): Whether the rule is actively evaluated.
  """

  unit_category: str = Field(..., min_length=1, max_length=100, description="Unit or department category")
  threshold_percentage: float = Field(..., ge=1.0, le=100.0, description="Trigger occupancy percentage")
  severity: AlertSeverity = Field(default=AlertSeverity.WARNING, description="Alert severity level")
  is_active: bool = Field(default=True, description="Active status flag")


class AlertRuleCreate(AlertRuleBase):
  """
  Payload for creating a new clinical alert rule.
  """

  pass


class AlertRuleUpdate(BaseModel):
  """
  Payload for updating an existing clinical alert rule with partial attributes.

  Attributes:
      unit_category (str | None): Updated unit or department category.
      threshold_percentage (float | None): Updated trigger percentage.
      severity (AlertSeverity | None): Updated severity classification.
      is_active (bool | None): Updated active evaluation flag.
  """

  unit_category: str | None = Field(default=None, min_length=1, max_length=100)
  threshold_percentage: float | None = Field(default=None, ge=1.0, le=100.0)
  severity: AlertSeverity | None = None
  is_active: bool | None = None


class AlertRuleResponse(AlertRuleBase):
  """
  Response model representing a persisted clinical alert rule.

  Attributes:
      id (UUID): Unique rule identifier.
      created_at (datetime): Rule registration timestamp.
  """

  id: UUID
  created_at: datetime

  model_config = ConfigDict(from_attributes=True)
