"""
Analytics Schemas.

Defines DTOs for analytics views over LLM candidate output.
"""

from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class LlmOutputAnalyticsRow(BaseModel):
  """
  Flattened analytics row for LLM candidate outputs.
  """

  source: Literal["chat", "ai"]
  candidate_id: UUID
  assistant_message_id: Optional[UUID] = None
  conversation_id: Optional[UUID] = None
  conversation_title: Optional[str] = None
  user_id: UUID
  user_email: str
  query_text: Optional[str] = None
  prompt_strategy: Optional[str] = None
  llm: str
  sql_snippet: Optional[str] = None
  sql_hash: Optional[str] = None
  is_selected: bool
  created_at: datetime

  model_config = ConfigDict(from_attributes=True)
