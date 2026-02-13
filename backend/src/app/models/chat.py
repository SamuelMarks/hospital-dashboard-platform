"""
Chat Persistence Models.

This module defines the database entities required to support the Ad-Hoc Analysis
feature. It provides a stateful conversation history between the User and the
AI Agent, allowing context retention and SQL snippet tracking.
"""

import uuid
from typing import List, Optional
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.postgres import Base


class Conversation(Base):
  """
  Represents a threaded discussion between a User and the Analytics Assistant.

  Attributes:
      id (uuid.UUID): Unique identifier for the conversation session.
      user_id (uuid.UUID): Foreign key to the owner (User).
      title (str): A human-readable summary of the chat (e.g., "ICU Trends").
      created_at (datetime): Timestamp when the chat started.
      updated_at (datetime): Timestamp of the last activity (used for sorting).
      messages (List[Message]): One-to-Many relationship with individual messages.
  """

  __tablename__ = "conversations"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
  title: Mapped[str] = mapped_column(String, index=True, nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
  updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    onupdate=func.now(),
    nullable=False,
    index=True,
  )

  # Relationships
  # Cascade delete-orphan ensures that if a Conversation is deleted, all its messages are wiped.
  messages: Mapped[List["Message"]] = relationship(
    "Message", back_populates="conversation", cascade="all, delete-orphan", lazy="selectin"
  )
  user = relationship("app.models.user.User")

  def __repr__(self) -> str:
    """Return distinct string representation."""
    return f"<Conversation {self.title} ({self.id})>"


class Message(Base):
  """
  Represents a single atomic exchange within a Conversation.

  Attributes:
      id (uuid.UUID): Unique identifier.
      conversation_id (uuid.UUID): Link to the parent Conversation.
      role (str): The entity speaking. 'user' or 'assistant'.
      content (str): The natural language text content.
      sql_snippet (Optional[str]): If the assistant generated SQL, it is stored
          separately here for easy extraction and execution by the UI.
      created_at (datetime): Message timestamp.
      candidates (List[MessageCandidate]): Alternative responses for Arena voting.
  """

  __tablename__ = "messages"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id"), nullable=False, index=True)
  role: Mapped[str] = mapped_column(String, nullable=False)  # 'user' | 'assistant'
  content: Mapped[str] = mapped_column(Text, nullable=False)
  sql_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  # Relationships
  conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
  candidates: Mapped[List["MessageCandidate"]] = relationship(
    "MessageCandidate", back_populates="message", cascade="all, delete-orphan", lazy="selectin"
  )

  def __repr__(self) -> str:
    """Return distinct string representation."""
    return f"<Message {self.role}: {self.content[:20]}...>"


class MessageCandidate(Base):
  """
  Represents one of the multiple LLM responses generated for an assistant message
  in the Arena mode. Users vote on these to select the 'winner'.

  sql_hash provides a stable fingerprint of the SQL snippet for equivalence grouping.
  """

  __tablename__ = "message_candidates"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id"), nullable=False, index=True)
  model_name: Mapped[str] = mapped_column(String, nullable=False)
  content: Mapped[str] = mapped_column(Text, nullable=False)
  sql_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
  sql_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
  is_selected: Mapped[bool] = mapped_column(Boolean, default=False)

  message: Mapped["Message"] = relationship("Message", back_populates="candidates")

  def __repr__(self) -> str:
    """Return string rep."""
    return f"<Candidate {self.model_name} for Msg {self.message_id}>"
