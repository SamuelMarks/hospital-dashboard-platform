"""
Analytics Schemas.

Defines DTOs for analytics views over LLM candidate output.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class LlmOutputAnalyticsRow(BaseModel):
  """
  Flattened analytics row for LLM candidate outputs.
  """

  source: Literal["chat", "ai"]
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
