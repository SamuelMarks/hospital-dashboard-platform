"""add_sql_hash_to_candidates

Revision ID: 006
Revises: 005
Create Date: 2026-02-13 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Apply migration: Add sql_hash to candidate tables."""
  op.add_column("model_candidates", sa.Column("sql_hash", sa.String(length=64), nullable=True))
  op.add_column("message_candidates", sa.Column("sql_hash", sa.String(length=64), nullable=True))
  op.create_index("ix_model_candidates_sql_hash", "model_candidates", ["sql_hash"], unique=False)
  op.create_index("ix_message_candidates_sql_hash", "message_candidates", ["sql_hash"], unique=False)


def downgrade() -> None:
  """Revert migration."""
  op.drop_index("ix_message_candidates_sql_hash", table_name="message_candidates")
  op.drop_index("ix_model_candidates_sql_hash", table_name="model_candidates")
  op.drop_column("message_candidates", "sql_hash")
  op.drop_column("model_candidates", "sql_hash")
