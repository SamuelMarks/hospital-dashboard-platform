"""
Template Seeding Service.

This module provides the logic to populate the database with the initial "Pulse Content Pack"
automatically at application startup. It reads the `initial_templates.json` file and
performs an idempotent upsert (insert or update) for each template.
"""

import json
import logging
import os
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.diagnostics import (
  diagnostics_registry,
  format_missing_template_warning_banner,
)
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
      banner = format_missing_template_warning_banner(DATA_FILE)
      logger.warning("\n" + banner)
      diagnostics_registry.template_status = {
        "templates_loaded": 0,
        "has_templates": False,
        "missing_file": True,
      }
      diagnostics_registry.add_warning(
        code="MISSING_TEMPLATE_PACK",
        message=f"Template pack missing at {DATA_FILE}.",
        severity="warning",
        remediation="Verify repository data/ directory contains initial_templates.json.",
      )
      return

    try:
      with open(DATA_FILE, "r", encoding="utf-8") as f:
        templates_data: list[dict[str, Any]] = json.load(f)

      async with AsyncSessionLocal() as db:
        await TemplateSeeder._process_batch(db, templates_data)
        await db.commit()

      diagnostics_registry.template_status = {
        "templates_loaded": len(templates_data),
        "has_templates": len(templates_data) > 0,
        "missing_file": False,
      }
      if not templates_data:
        diagnostics_registry.add_warning(
          code="EMPTY_TEMPLATE_PACK",
          message=f"Template pack at {DATA_FILE} contains 0 templates.",
          severity="warning",
          remediation="Populate data/initial_templates.json with template objects.",
        )

      logger.info(f"✅ Template Seeding Complete: {len(templates_data)} items processed.")

    except json.JSONDecodeError as e:
      logger.error(f"❌ Invalid JSON in Content Pack: {e}")
      diagnostics_registry.template_status = {
        "templates_loaded": 0,
        "has_templates": False,
        "missing_file": False,
      }
      diagnostics_registry.add_warning(
        code="CORRUPTED_TEMPLATE_PACK",
        message=f"Invalid JSON syntax in template pack: {e}",
        severity="error",
        remediation=f"Validate JSON formatting in {DATA_FILE}.",
      )
    except Exception as e:
      logger.exception(f"❌ Unexpected seeding error: {e}")
      diagnostics_registry.add_warning(
        code="TEMPLATE_SEEDING_ERROR",
        message=f"Unexpected error while seeding templates: {e}",
        severity="error",
        remediation="Check PostgreSQL connection and template schema compatibility.",
      )

  @staticmethod
  async def _process_batch(db: AsyncSession, data_list: list[dict[str, Any]]) -> None:
    """
    Iterates through the data list and upserts each record.

    Args:
        db (AsyncSession): Database session.
        data_list (List[Dict]): The parsed JSON objects.
    """
    for item in data_list:
      await TemplateSeeder._upsert_template(db, item)

  @staticmethod
  async def _upsert_template(db: AsyncSession, data: dict[str, Any]) -> None:
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
