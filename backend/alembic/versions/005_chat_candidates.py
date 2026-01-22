"""chat_candidates

Revision ID: 005
Revises: 004
Create Date: 2024-04-15 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """
  Apply migration: Add message_candidates table for Arena Chat.
  """
  op.create_table(
    "message_candidates",
    sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("model_name", sa.String(), nullable=False),
    sa.Column("content", sa.Text(), nullable=False),
    sa.Column("sql_snippet", sa.Text(), nullable=True),
    sa.Column("is_selected", sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(
    op.f("ix_message_candidates_message_id"),
    "message_candidates",
    ["message_id"],
    unique=False,
  )


def downgrade() -> None:
  """
  Revert migration.
  """
  op.drop_index(op.f("ix_message_candidates_message_id"), table_name="message_candidates")
  op.drop_table("message_candidates")
