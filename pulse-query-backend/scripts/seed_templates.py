"""
Template Seeding Script.

This utility loads the definition of standard analytics templates from `initial_templates.json`
and populates the `widget_templates` table in the PostgreSQL database.
It is idempotent: matching titles are updated, new ones inserted. This ensures that
content updates (SQL fixes) in the JSON file are propagated to the database on re-runs.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure backend modules are resolvable by adding the 'src' directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from app.database.postgres import AsyncSessionLocal
from app.models.template import WidgetTemplate

# Configuration
DATA_FILE = os.path.join(os.path.dirname(__file__), "../data/initial_templates.json")

# Logging Setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("seed_templates")


def _read_templates_disk(filepath: str) -> list[dict[str, Any]] | None:
  """
  Synchronously checks and reads template JSON records from `filepath`.

  Args:
      filepath (str): Path to the template JSON file.

  Returns:
      list[dict[str, Any]] | None: Parsed list of templates, or None if missing.
  """
  if not os.path.exists(filepath):
    return None
  with open(filepath, "r", encoding="utf-8") as f:
    data: list[dict[str, Any]] = json.load(f)
    return data


async def seed_templates() -> None:
  """
  Main execution orchestration.
  1. Validates file existence.
  2. Reads and parses JSON.
  3. Opens DB session and iterates through records for Upsert.
  """
  logger.info(f"📂 Loading templates from {DATA_FILE}")

  try:
    templates_data = _read_templates_disk(DATA_FILE)
  except json.JSONDecodeError as e:
    logger.error(f"❌ Invalid JSON format in content pack: {e}")
    return

  if templates_data is None:
    logger.error(f"❌ Data file not found at {DATA_FILE}")
    return

  async with AsyncSessionLocal() as db:
    try:
      for item in templates_data:
        await upsert_template(db, item)

      await db.commit()
      logger.info(f"✅ Seeding complete. Processed {len(templates_data)} templates.")
    except Exception as e:
      await db.rollback()
      logger.exception(f"❌ Database error during seeding: {e}")


async def upsert_template(db: AsyncSession, data: dict[str, Any]) -> None:
  """
  Insert a new template or Update an existing one based on the unique 'title'.

  Args:
      db (AsyncSession): Active database session.
      data (Dict[str, Any]): Dictionary containing template fields
                             (title, description, sql_template, category, parameters_schema).
  """
  title = data["title"]

  # Check for existence by Title
  query = select(WidgetTemplate).where(WidgetTemplate.title == title)
  result = await db.execute(query)
  existing = result.scalars().first()

  if existing:
    # Update existing record
    logger.info(f"🔄 Updating: {title}")
    raw_desc = data.get("description")
    existing.description = str(raw_desc) if raw_desc is not None else ""
    existing.sql_template = data["sql_template"]
    existing.category = data["category"]
    existing.parameters_schema = data.get("parameters_schema", [])
  else:
    # Create new record
    logger.info(f"✨ Creating: {title}")
    new_template = WidgetTemplate(
      title=title,
      description=data.get("description"),
      sql_template=data["sql_template"],
      category=data["category"],
      parameters_schema=data.get("parameters_schema", []),
    )
    db.add(new_template)


def main() -> None:
  """
  CLI entry point for running `seed_templates()`.
  """
  if sys.platform == "win32":  # pragma: no cover
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

  asyncio.run(seed_templates())


if __name__ == "__main__":
  main()
