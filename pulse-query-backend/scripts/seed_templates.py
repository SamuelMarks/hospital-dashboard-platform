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

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure backend modules are resolvable by adding the 'src' directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from app.core.config import BACKEND_ROOT
from app.database.postgres import AsyncSessionLocal
from app.services.template_seeder import TemplateSeeder, template_seeder

# Configuration
DATA_FILE = str((BACKEND_ROOT / "data" / "initial_templates.json").resolve())

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


async def seed_templates() -> int:
  """
  Main execution orchestration delegating batch upsert to `template_seeder.seed_Async`
  and verifying the total template count in PostgreSQL.

  Returns:
      int: Total number of templates present in the database after seeding.
  """
  logger.info(f"📂 Loading templates from {DATA_FILE}")

  try:
    templates_data = _read_templates_disk(DATA_FILE)
  except json.JSONDecodeError as e:
    logger.error(f"❌ Invalid JSON format in content pack: {e}")
    return 0

  if templates_data is None:
    logger.error(f"❌ Data file not found at {DATA_FILE}")
    return 0

  async with AsyncSessionLocal() as db:
    try:
      await template_seeder.seed_Async(db, templates_data=templates_data)
      count_res = await db.execute(text("SELECT COUNT(*) FROM templates"))
      total_count = int(count_res.scalar_one_or_none() or 0)
      print(f"Total templates in pulse_query_db: {total_count}")
      logger.info(f"✅ Seeding complete. Processed {len(templates_data)} templates (total in DB: {total_count}).")
      return total_count
    except Exception as e:
      await db.rollback()
      logger.exception(f"❌ Database error during seeding: {e}")
      return 0


def main() -> None:
  """
  CLI entry point for running `seed_templates()` and asserting >= 10 templates exist.
  """
  if sys.platform == "win32":  # pragma: no cover
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

  count = asyncio.run(seed_templates())
  if isinstance(count, int) and count < 10:
    print(f"Error: Expected >= 10 templates in pulse_query_db, found {count}.")
    sys.exit(1)


if __name__ == "__main__":
  main()
