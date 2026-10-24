"""
Analytics Schemas.

Defines DTOs for analytics views over LLM candidate output and bed capacity alerts.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.alert_rule import AlertSeverity


class LlmOutputAnalyticsRow(BaseModel):
  """
  Flattened analytics row representing a single LLM candidate response.
  """

  source: Literal["chat", "ai", "mpax_arena"]
  candidate_id: UUID
  assistant_message_id: UUID | None = None
  conversation_id: UUID | None = None
  conversation_title: str | None = None
  user_id: UUID
  user_email: str
  query_text: str | None = None
  prompt_strategy: str | None = None
  llm: str
  sql_snippet: str | None = None
  sql_hash: str | None = None
  is_selected: bool
  created_at: datetime

  model_config = ConfigDict(from_attributes=True)


class BedCapacityAlert(BaseModel):
  """
  Real-time capacity alert triggered when unit occupancy exceeds safe thresholds.
  """

  unit_category: str
  current_census: int
  max_capacity: int
  occupancy_percentage: float
  threshold_percentage: float
  severity: AlertSeverity | Literal["INFO", "WARNING", "CRITICAL"]
  message: str
  timestamp: datetime

  model_config = ConfigDict(from_attributes=True)
