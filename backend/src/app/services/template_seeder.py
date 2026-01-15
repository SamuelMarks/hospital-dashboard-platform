"""
Template Seeding Service.

This module provides the logic to populate the database with the initial "Pulse Content Pack"
automatically at application startup. It reads the `initial_templates.json` file and
performs an idempotent upsert (insert or update) for each template.
"""

import json
import os
import logging
from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgres import AsyncSessionLocal
from app.models.template import WidgetTemplate

# Configure Path relative to this file:
# src/app/services -> ../../../data/initial_templates.json
DATA_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/initial_templates.json"))

logger = logging.getLogger("template_seeder")


class TemplateSeeder:
  """
  Service class to manage the seeding lifecycle of Analytics Templates.
  """

  @staticmethod
  async def seed_defaults() -> None:
    """
    Orchestrates the loading of default templates into the database.
    Designed to be called during ASGI startup.
    """
    if not os.path.exists(DATA_FILE):
      logger.warning(f"⚠️ Content Pack missing at {DATA_FILE}. Skipping seeding.")
      return

    try:
      with open(DATA_FILE, "r", encoding="utf-8") as f:
        templates_data: List[Dict[str, Any]] = json.load(f)

      async with AsyncSessionLocal() as db:
        await TemplateSeeder._process_batch(db, templates_data)
        await db.commit()

      logger.info(f"✅ Template Seeding Complete: {len(templates_data)} items processed.")

    except json.JSONDecodeError as e:
      logger.error(f"❌ Invalid JSON in Content Pack: {e}")
    except Exception as e:
      logger.exception(f"❌ Unexpected seeding error: {e}")

  @staticmethod
  async def _process_batch(db: AsyncSession, data_list: List[Dict[str, Any]]) -> None:
    """
    Iterates through the data list and upserts each record.

    Args:
        db (AsyncSession): Database session.
        data_list (List[Dict]): The parsed JSON objects.
    """
    for item in data_list:
      await TemplateSeeder._upsert_template(db, item)

  @staticmethod
  async def _upsert_template(db: AsyncSession, data: Dict[str, Any]) -> None:
    """
    Insert a new template or Update an existing one based on the unique 'title'.

    Args:
        db (AsyncSession): Active database session.
        data (Dict[str, Any]): Dictionary containing template fields.
    """
    title = data["title"]

    # Check for existence by Title
    query = select(WidgetTemplate).where(WidgetTemplate.title == title)
    result = await db.execute(query)
    existing = result.scalars().first()

    if existing:
      # Update existing record (migration strategy: newest JSON always wins)
      existing.description = data.get("description")
      existing.sql_template = data["sql_template"]
      existing.category = data["category"]
      existing.parameters_schema = data.get("parameters_schema", {})
    else:
      # Create new record
      new_template = WidgetTemplate(
        title=title,
        description=data.get("description"),
        sql_template=data["sql_template"],
        category=data["category"],
        parameters_schema=data.get("parameters_schema", {}),
      )
      db.add(new_template)
