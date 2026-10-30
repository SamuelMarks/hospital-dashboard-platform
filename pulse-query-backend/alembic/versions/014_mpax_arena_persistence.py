"""
Alembic migration replacing legacy MPAX Arena tables with the LLM + JAX + MPAX
Hospital Operations Optimization Platform tables (`optimization_sessions`,
`optimization_iterations`, and `optimization_surveys`).

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
  """Drop legacy mpax_arena tables if present and create optimization platform tables."""
  op.execute("DROP TABLE IF EXISTS mpax_arena_candidates")
  op.execute("DROP TABLE IF EXISTS mpax_arena_runs")

  op.create_table(
    "optimization_sessions",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("use_case", sa.String(length=50), nullable=False),
    sa.Column("institution_id", sa.String(length=64), nullable=False),
    sa.Column("title", sa.String(length=200), nullable=False),
    sa.Column("active_constraints_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("latest_solution_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("baseline_comparison_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  op.create_index(op.f("ix_optimization_sessions_user_id"), "optimization_sessions", ["user_id"], unique=False)

  op.create_table(
    "optimization_iterations",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column(
      "session_id",
      postgresql.UUID(as_uuid=True),
      sa.ForeignKey("optimization_sessions.id", ondelete="CASCADE"),
      nullable=False,
    ),
    sa.Column("turn_index", sa.Integer(), nullable=False, server_default="1"),
    sa.Column("user_prompt", sa.Text(), nullable=False),
    sa.Column("quick_action_id", sa.String(length=64), nullable=True),
    sa.Column("model_id", sa.String(length=120), nullable=False),
    sa.Column("extracted_constraints_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("solver_output_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("des_metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("expert_baseline_gap", sa.Float(), nullable=False, server_default="0.0"),
    sa.Column("assistant_explanation", sa.Text(), nullable=False),
    sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  op.create_index(
    op.f("ix_optimization_iterations_session_id"),
    "optimization_iterations",
    ["session_id"],
    unique=False,
  )

  op.create_table(
    "optimization_surveys",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column(
      "session_id",
      postgresql.UUID(as_uuid=True),
      sa.ForeignKey("optimization_sessions.id", ondelete="SET NULL"),
      nullable=True,
    ),
    sa.Column("use_case", sa.String(length=50), nullable=False),
    sa.Column("role_category", sa.String(length=80), nullable=False),
    sa.Column("score_vs_manual_process", sa.Integer(), nullable=False),
    sa.Column("score_vs_other_workflow_tech", sa.Integer(), nullable=False),
    sa.Column("interpretability_score", sa.Integer(), nullable=False),
    sa.Column("qualitative_feedback", sa.Text(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  op.create_index(op.f("ix_optimization_surveys_user_id"), "optimization_surveys", ["user_id"], unique=False)
  op.create_index(op.f("ix_optimization_surveys_session_id"), "optimization_surveys", ["session_id"], unique=False)


def downgrade() -> None:
  """Drop optimization_surveys, optimization_iterations, and optimization_sessions tables."""
  op.drop_index(op.f("ix_optimization_surveys_session_id"), table_name="optimization_surveys")
  op.drop_index(op.f("ix_optimization_surveys_user_id"), table_name="optimization_surveys")
  op.drop_table("optimization_surveys")
  op.drop_index(op.f("ix_optimization_iterations_session_id"), table_name="optimization_iterations")
  op.drop_table("optimization_iterations")
  op.drop_index(op.f("ix_optimization_sessions_user_id"), table_name="optimization_sessions")
  op.drop_table("optimization_sessions")
