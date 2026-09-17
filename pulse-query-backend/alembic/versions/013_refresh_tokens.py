"""
Alembic migration for RefreshToken model.

Revision ID: 013
Revises: 012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "013"
down_revision: str | Sequence[str] | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Create refresh_tokens table."""
  op.create_table(
    "refresh_tokens",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("token_hash", sa.String(length=255), nullable=False),
    sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
  op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=False)


def downgrade() -> None:
  """Drop refresh_tokens table."""
  op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
  op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
  op.drop_table("refresh_tokens")
