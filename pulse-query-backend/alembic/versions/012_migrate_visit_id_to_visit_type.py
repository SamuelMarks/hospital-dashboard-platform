"""
Alembic data migration to canonicalize stored widget queries from Visit_ID to Visit_Type.

Revision ID: 012
Revises: 011
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012"
down_revision: str | Sequence[str] | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """
  Update stored widget query configurations replacing Visit_ID with Visit_Type.
  """
  bind = op.get_bind()
  widgets_table = sa.table(
    "widgets",
    sa.column("id", sa.UUID()),
    sa.column("config", sa.JSON()),
  )
  try:
    results = bind.execute(sa.select(widgets_table.c.id, widgets_table.c.config)).fetchall()
    for row in results:
      widget_id = row[0]
      config = row[1]
      if isinstance(config, str):
        try:
          config = json.loads(config)
        except Exception:
          continue
      if isinstance(config, dict) and "query" in config and isinstance(config["query"], str):
        if "Visit_ID" in config["query"]:
          updated_config = dict(config)
          updated_config["query"] = config["query"].replace("Visit_ID", "Visit_Type")
          bind.execute(widgets_table.update().where(widgets_table.c.id == widget_id).values(config=updated_config))
  except Exception:
    pass


def downgrade() -> None:
  """
  Downgrade step (no-op for data migration).
  """
  pass
