"""Add language_preference to User

Revision ID: 008
Revises: 3327052dcb84
Create Date: 2026-08-07 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: str | Sequence[str] | None = "3327052dcb84"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  op.add_column("users", sa.Column("language_preference", sa.String(), server_default="en", nullable=False))


def downgrade() -> None:
  op.drop_column("users", "language_preference")
