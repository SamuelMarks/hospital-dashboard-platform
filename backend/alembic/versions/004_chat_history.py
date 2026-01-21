"""chat_history

Revision ID: 004
Revises: 003
Create Date: 2024-04-01 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """
  Apply migration: Create conversation and message history tables.

  1. conversations: High-level session tracking. Includes `updated_at` index
     for sorting sidebar lists efficiently.
  2. messages: atomic chat logs. Includes `sql_snippet` to persist generated
     queries separately from markdown text logic.
  """
  # 1. Create Conversations Table
  op.create_table(
    "conversations",
    sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("title", sa.String(), nullable=False),
    sa.Column(
      "created_at",
      sa.DateTime(timezone=True),
      server_default=sa.text("now()"),
      nullable=False,
    ),
    sa.Column(
      "updated_at",
      sa.DateTime(timezone=True),
      server_default=sa.text("now()"),
      nullable=False,
    ),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  # Indexes for sorting and lookups
  op.create_index(op.f("ix_conversations_title"), "conversations", ["title"], unique=False)
  op.create_index(op.f("ix_conversations_updated_at"), "conversations", ["updated_at"], unique=False)
  op.create_index(op.f("ix_conversations_user_id"), "conversations", ["user_id"], unique=False)

  # 2. Create Messages Table
  op.create_table(
    "messages",
    sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("role", sa.String(), nullable=False),
    sa.Column("content", sa.Text(), nullable=False),
    sa.Column("sql_snippet", sa.Text(), nullable=True),
    sa.Column(
      "created_at",
      sa.DateTime(timezone=True),
      server_default=sa.text("now()"),
      nullable=False,
    ),
    sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(
    op.f("ix_messages_conversation_id"),
    "messages",
    ["conversation_id"],
    unique=False,
  )


def downgrade() -> None:
  """
  Revert migration: Drop chat history tables.
  """
  op.drop_index(op.f("ix_messages_conversation_id"), table_name="messages")
  op.drop_table("messages")
  op.drop_index(op.f("ix_conversations_user_id"), table_name="conversations")
  op.drop_index(op.f("ix_conversations_updated_at"), table_name="conversations")
  op.drop_index(op.f("ix_conversations_title"), table_name="conversations")
  op.drop_table("conversations")
