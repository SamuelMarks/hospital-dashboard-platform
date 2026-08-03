"""
Chat Domain Schemas.

This module defines the Pydantic Data Transfer Objects (DTOs) for the
Chat/Conversation feature. It handles validation for creating messages,
listing conversations, and serializing history for the frontend.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
  # We generally don't return all messages in the list view to save bandwidth
  # messages: List[MessageResponse] = []

  model_config = ConfigDict(from_attributes=True)


class ConversationDetail(ConversationResponse):
  """
  Detailed view including message history.
  """

  messages: list[MessageResponse] = []
