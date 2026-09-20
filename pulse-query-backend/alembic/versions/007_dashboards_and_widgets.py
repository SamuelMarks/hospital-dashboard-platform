"""Add dashboards and widgets tables

Revision ID: 007
Revises: 3327052dcb84
Create Date: 2026-08-01 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: str | Sequence[str] | None = "3327052dcb84"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """
  Apply migration: Create dashboards and widgets tables.
  """
  op.create_table(
    "dashboards",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("owner_id", sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_dashboards_name"), "dashboards", ["name"], unique=False)

  op.create_table(
    "widgets",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("dashboard_id", sa.UUID(), nullable=False),
    sa.Column("title", sa.String(), nullable=False),
    sa.Column("type", sa.String(), nullable=False),
    sa.Column("visualization", sa.String(), server_default="table", nullable=False),
    sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'"), nullable=False),
    sa.ForeignKeyConstraint(["dashboard_id"], ["dashboards.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_widgets_dashboard_id"), "widgets", ["dashboard_id"], unique=False)


def downgrade() -> None:
  """
  Revert migration: Drop widgets and dashboards tables.
  """
  op.drop_index(op.f("ix_widgets_dashboard_id"), table_name="widgets")
  op.drop_table("widgets")
  op.drop_index(op.f("ix_dashboards_name"), table_name="dashboards")
  op.drop_table("dashboards")
