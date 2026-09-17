"""
Alembic migration for MPAX Arena persistence and candidate voting models.

Revision ID: 014
Revises: 013
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "014"
down_revision: str | Sequence[str] | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Create mpax_arena_runs and mpax_arena_candidates tables."""
  op.create_table(
    "mpax_arena_runs",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("prompt", sa.Text(), nullable=False),
    sa.Column("mode", sa.String(length=50), nullable=False),
    sa.Column("ground_truth_mpax", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  op.create_index(op.f("ix_mpax_arena_runs_user_id"), "mpax_arena_runs", ["user_id"], unique=False)

  op.create_table(
    "mpax_arena_candidates",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column(
      "run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mpax_arena_runs.id", ondelete="CASCADE"), nullable=False
    ),
    sa.Column("model_name", sa.String(length=100), nullable=False),
    sa.Column("content", sa.Text(), nullable=False),
    sa.Column("sql_snippet", sa.Text(), nullable=True),
    sa.Column("mpax_score", sa.Integer(), nullable=True),
    sa.Column("mpax_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("is_winner", sa.Boolean(), nullable=False, server_default=sa.false()),
  )
  op.create_index(op.f("ix_mpax_arena_candidates_run_id"), "mpax_arena_candidates", ["run_id"], unique=False)


def downgrade() -> None:
  """Drop mpax_arena_candidates and mpax_arena_runs tables."""
  op.drop_index(op.f("ix_mpax_arena_candidates_run_id"), table_name="mpax_arena_candidates")
  op.drop_table("mpax_arena_candidates")
  op.drop_index(op.f("ix_mpax_arena_runs_user_id"), table_name="mpax_arena_runs")
  op.drop_table("mpax_arena_runs")
