"""
Template Seeding Script.

This utility loads the definition of standard analytics templates from `initial_templates.json`
and populates the `widget_templates` table in the PostgreSQL database by delegating
to `TemplateSeeder`.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

# Ensure backend modules are resolvable by adding the 'src' directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from app.database.postgres import AsyncSessionLocal
from app.services.template_seeder import TemplateSeeder

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


async def upsert_template(db: AsyncSession, data: dict[str, Any]) -> None:
  """
  Delegates template upsert to `TemplateSeeder._upsert_template`.

  Args:
      db (AsyncSession): Active database session.
      data (dict[str, Any]): Dictionary containing template fields.
  """
  await TemplateSeeder._upsert_template(db, data)


async def seed_templates() -> None:
  """
  Main execution orchestration delegating batch upsert to `TemplateSeeder`.
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
      await TemplateSeeder._process_batch(db, templates_data)
      await db.commit()
      logger.info(f"✅ Seeding complete. Processed {len(templates_data)} templates.")
    except Exception as e:
      await db.rollback()
      logger.exception(f"❌ Database error during seeding: {e}")


def main() -> None:
  """
  CLI entry point for running `seed_templates()`.
  """
  if sys.platform == "win32":  # pragma: no cover
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

  asyncio.run(seed_templates())


if __name__ == "__main__":
  main()
