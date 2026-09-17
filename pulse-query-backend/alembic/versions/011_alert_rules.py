"""
Alembic migration for AlertRule model.

Revision ID: 011_alert_rules
Revises: 010
Create Date: 2026-09-15 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011"
down_revision: str | Sequence[str] | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """
  Create alert_rules table.
  """
  op.create_table(
    "alert_rules",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("unit_category", sa.String(), nullable=False),
    sa.Column("threshold_percentage", sa.Float(), nullable=False),
    sa.Column("severity", sa.String(), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_alert_rules_unit_category"), "alert_rules", ["unit_category"], unique=False)


def downgrade() -> None:
  """
  Drop alert_rules table.
  """
  op.drop_index(op.f("ix_alert_rules_unit_category"), table_name="alert_rules")
  op.drop_table("alert_rules")
