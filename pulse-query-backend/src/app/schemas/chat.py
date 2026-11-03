"""
Chat Domain Schemas.

This module defines the Pydantic Data Transfer Objects (DTOs) for the
Chat/Conversation feature. It handles validation for creating messages,
listing conversations, inline read-only DuckDB SQL previews, and serializing
history for the frontend.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.json_types import SqlRow


class SqlPreviewPayload(BaseModel):
  """
  Inline read-only DuckDB execution preview attached to a chat message or arena candidate.

  Attributes:
      columns (list[str]): Ordered column names returned by the read-only DuckDB query.
      data (list[SqlRow]): Bounded preview rows (up to `max_rows`).
      row_count (int): Number of rows returned in `data`.
      execution_time_ms (float): Query execution duration in milliseconds.
      truncated (bool): True if the result set reached the preview row cap.
      error (str | None): Validation or DuckDB execution error message if execution failed.
  """

  columns: list[str] = Field(default_factory=list)
  data: list[SqlRow] = Field(default_factory=list)
  row_count: int = 0
  execution_time_ms: float = 0.0
  truncated: bool = False
  error: str | None = None


class MessageBase(BaseModel):
  """
  Shared properties for a message.
  """

  content: str


class MessageCreate(MessageBase):
  """
  Payload for sending a message from the User.
  Role is implicitly 'user'.
  """

  target_models: list[str] | None = Field(default=None, description="Optional list of model IDs to query.")
  auto_execute_sql: bool = Field(
    default=True,
    description="Whether to automatically execute extracted SQL against read-only DuckDB and attach a preview.",
  )


class MessageCandidateResponse(BaseModel):
  """
  DTO for a single Arena Candidate.
  """

  id: UUID
  model_name: str
  content: str
  sql_snippet: str | None = None
  sql_hash: str | None = None
  is_selected: bool
  sql_preview: SqlPreviewPayload | None = None

  model_config = ConfigDict(from_attributes=True)


class MessageResponse(MessageBase):
  """
  API Response model for a persisted Message.
  """

  id: UUID
  conversation_id: UUID
  role: str
  sql_snippet: str | None = None
  created_at: datetime
  candidates: list[MessageCandidateResponse] = []
  sql_preview: SqlPreviewPayload | None = None

  # Allow reading from SQLAlchemy ORM models
  model_config = ConfigDict(from_attributes=True)


class MessageVoteRequest(BaseModel):
  """
  Payload for voting on a candidate.
  """

  candidate_id: UUID


class ConversationBase(BaseModel):
  """
  Shared properties for a conversation.
  """

  title: str | None = None


class ConversationCreate(ConversationBase):
  """
  Payload for starting a new conversation.
  If 'message' is provided, the conversation is initialized with it.
  """

  message: str | None = Field(None, description="Initial message to kickstart the chat.")
  target_models: list[str] | None = Field(None, description="Optional list of model IDs to query.")
  auto_execute_sql: bool = Field(
    default=True,
    description="Whether to automatically execute generated SQL against read-only DuckDB.",
  )


class ConversationUpdate(BaseModel):
  """
  Payload for updating conversation metadata (e.g. rename).
  """

  title: str = Field(..., min_length=1, max_length=100)


class ConversationResponse(ConversationBase):
  """
  API Response model for a Conversation metadata wrapper.
  """

  id: UUID
  user_id: UUID
  created_at: datetime
  updated_at: datetime

  model_config = ConfigDict(from_attributes=True)


class ConversationDetail(ConversationResponse):
  """
  Detailed view including message history.
  """

  messages: list[MessageResponse] = []
