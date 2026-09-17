"""Add dashboard_shares table for multi-user sharing

Revision ID: 009
Revises: 008
Create Date: 2026-09-14 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009"
down_revision: str | Sequence[str] | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  op.create_table(
    "dashboard_shares",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("dashboard_id", sa.UUID(), nullable=False),
    sa.Column("user_id", sa.UUID(), nullable=False),
    sa.Column("permission_level", sa.String(), server_default="VIEW", nullable=False),
    sa.ForeignKeyConstraint(["dashboard_id"], ["dashboards.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
    sa.UniqueConstraint("dashboard_id", "user_id", name="uq_dashboard_user_share"),
  )
  op.create_index(op.f("ix_dashboard_shares_dashboard_id"), "dashboard_shares", ["dashboard_id"], unique=False)
  op.create_index(op.f("ix_dashboard_shares_user_id"), "dashboard_shares", ["user_id"], unique=False)


def downgrade() -> None:
  op.drop_index(op.f("ix_dashboard_shares_user_id"), table_name="dashboard_shares")
  op.drop_index(op.f("ix_dashboard_shares_dashboard_id"), table_name="dashboard_shares")
  op.drop_table("dashboard_shares")
