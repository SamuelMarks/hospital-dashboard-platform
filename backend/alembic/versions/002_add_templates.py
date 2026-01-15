"""add_templates

Revision ID: 002
Revises: 001
Create Date: 2024-03-20 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """
  Apply migration: Create widget_templates table.
  """
  op.create_table(
    "widget_templates",
    sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("title", sa.String(), nullable=False),
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("sql_template", sa.Text(), nullable=False),
    sa.Column("category", sa.String(), nullable=False),
    sa.Column("parameters_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_widget_templates_category"), "widget_templates", ["category"], unique=False)
  op.create_index(op.f("ix_widget_templates_title"), "widget_templates", ["title"], unique=False)


def downgrade() -> None:
  """
  Revert migration: Drop widget_templates table.
  """
  op.drop_index(op.f("ix_widget_templates_title"), table_name="widget_templates")
  op.drop_index(op.f("ix_widget_templates_category"), table_name="widget_templates")
  op.drop_table("widget_templates")
