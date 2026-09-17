"""
Alembic migration for Granular Hospital Role-Based Access Control (RBAC).

Revision ID: 010_granular_rbac
Revises: 009
Create Date: 2026-09-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: str | Sequence[str] | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """
  Add role column to users table with default DATA_ANALYST.
  """
  op.add_column(
    "users",
    sa.Column("role", sa.String(), server_default="DATA_ANALYST", nullable=False),
  )


def downgrade() -> None:
  """
  Remove role column from users table.
  """
  op.drop_column("users", "role")
