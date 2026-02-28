"""Add is_admin and AdminSetting

Revision ID: 3327052dcb84
Revises: 006
Create Date: 2026-02-27 16:59:12.970428

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "3327052dcb84"
down_revision: Union[str, Sequence[str], None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  # Add is_admin column to users table with default false
  op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False))

  op.create_table(
    "admin_settings",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("setting_key", sa.String(), nullable=False),
    sa.Column("setting_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_admin_settings_setting_key"), "admin_settings", ["setting_key"], unique=True)


def downgrade() -> None:
  op.drop_index(op.f("ix_admin_settings_setting_key"), table_name="admin_settings")
  op.drop_table("admin_settings")
  op.drop_column("users", "is_admin")
