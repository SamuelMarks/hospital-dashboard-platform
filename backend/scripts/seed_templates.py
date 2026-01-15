"""
Template Seeding Script.

This utility loads the definition of standard analytics templates from `initial_templates.json`
and populates the `widget_templates` table in the PostgreSQL database.
It is idempotent: matching titles are updated, new ones inserted. This ensures that
content updates (SQL fixes) in the JSON file are propagated to the database on re-runs.
"""

import asyncio
import json
import os
import sys
import logging
from typing import List, Dict, Any
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


async def seed_templates() -> None:
  """
  Main execution orchestration.
  1. Validates file existence.
  2. Reads and parses JSON.
  3. Opens DB session and iterates through records for Upsert.
  """
  if not os.path.exists(DATA_FILE):
    logger.error(f"❌ Data file not found at {DATA_FILE}")
    return

  logger.info(f"📂 Loading templates from {DATA_FILE}")

  try:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
      templates_data: List[Dict[str, Any]] = json.load(f)
  except json.JSONDecodeError as e:
    logger.error(f"❌ Invalid JSON format in content pack: {e}")
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


async def upsert_template(db: AsyncSession, data: Dict[str, Any]) -> None:
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
    existing.description = data.get("description")
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


if __name__ == "__main__":
  # Windows compatibility for asyncio loop
  if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

  asyncio.run(seed_templates())
