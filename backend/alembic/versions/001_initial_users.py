"""initial_users

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Create users table and email index."""
  op.create_table(
    "users",
    sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("email", sa.String(), nullable=False),
    sa.Column("hashed_password", sa.String(), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)


def downgrade() -> None:
  """Drop users table and index."""
  op.drop_index(op.f("ix_users_email"), table_name="users")
  op.drop_table("users")
