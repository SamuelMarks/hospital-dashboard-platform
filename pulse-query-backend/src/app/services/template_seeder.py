"""
Template Seeding Service.

This module provides the logic to populate the database with the initial "Pulse Content Pack"
automatically at application startup. It reads the `initial_templates.json` file and
performs an idempotent upsert (insert or update) for each template.
"""

from pathlib import Path
import json
import logging
import os
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_ROOT
from app.core.diagnostics import (
  diagnostics_registry,
  format_missing_template_warning_banner,
)
from app.database.postgres import AsyncSessionLocal
from app.models.template import WidgetTemplate

DATA_FILE = str((BACKEND_ROOT / "data" / "initial_templates.json").resolve())

logger = logging.getLogger("template_seeder")


class TemplateSeeder:
  """
  Service class to manage the seeding lifecycle of Analytics Templates.
  """

  def __init__(self, file_path: str | Path | None = None) -> None:
    """
    Initializes the template seeder with a resolved `file_path` pointing to `initial_templates.json`.

    Args:
        file_path (str | Path | None): Optional file path override; defaults to `BACKEND_ROOT / "data" / "initial_templates.json"`.
    """
    self.file_path: Path = (
      Path(file_path).resolve() if file_path is not None else (BACKEND_ROOT / "data" / "initial_templates.json").resolve()
    )

  @staticmethod
  def _check_template_file_exists(data_file: str | Path | None = None) -> bool:
    """
    Checks whether `data_file` (or `DATA_FILE`) exists on disk.

    Args:
        data_file (str | Path | None): Optional path override.

    Returns:
        bool: True if the template JSON file exists.
    """
    target = str(data_file) if data_file is not None else DATA_FILE
    return os.path.exists(target)

  @staticmethod
  def _read_template_file(data_file: str | Path | None = None) -> list[dict[str, Any]]:
    """
    Reads and parses `data_file` (or `DATA_FILE`) from disk.

    Args:
        data_file (str | Path | None): Optional path override.

    Returns:
        list[dict[str, Any]]: Parsed list of template dictionaries.
    """
    target = str(data_file) if data_file is not None else DATA_FILE
    with open(target, "r", encoding="utf-8") as f:
      data: list[dict[str, Any]] = json.load(f)
      return data

  @staticmethod
  async def _ensure_templates_view(db: AsyncSession) -> None:
    """
    Creates the `templates` compatibility SQL view over `widget_templates` for PostgreSQL or SQLite.

    Args:
        db (AsyncSession): Active database session.
    """
    bind = getattr(db, "bind", None) or getattr(getattr(db, "_session", None), "bind", None)
    dialect_name = getattr(getattr(bind, "dialect", None), "name", "")
    sql = (
      "CREATE OR REPLACE VIEW templates AS SELECT * FROM widget_templates"
      if dialect_name == "postgresql"
      else "CREATE VIEW IF NOT EXISTS templates AS SELECT * FROM widget_templates"
    )
    await db.execute(text(sql))

  async def seed_Async(
    self,
    db: AsyncSession,
    templates_data: list[dict[str, Any]] | None = None,
  ) -> int:
    """
    Seeds templates into the provided `db` session and ensures the `templates` view exists.

    Args:
        db (AsyncSession): Active database session.
        templates_data (list[dict[str, Any]] | None): Optional pre-parsed template list; reads `self.file_path` if None.

    Returns:
        int: Number of template items processed.
    """
    items = templates_data if templates_data is not None else self._read_template_file(self.file_path)
    await self._process_batch(db, items)
    await db.commit()
    diagnostics_registry.template_status = {
      "status": "ready" if len(items) > 0 else "empty",
      "template_count": len(items),
      "templates_loaded": len(items),
      "has_templates": len(items) > 0,
      "missing_file": False,
    }
    return len(items)

  @staticmethod
  async def seed_defaults(
    data_file: str | Path | None = None,
    db: AsyncSession | None = None,
  ) -> None:
    """
    Orchestrates the loading of default templates into the database.
    Designed to be called during ASGI startup.

    Args:
        data_file (str | Path | None): Optional JSON file path override.
        db (AsyncSession | None): Optional injected database session for testing.
    """
    target = str(data_file) if data_file is not None else DATA_FILE
    if not TemplateSeeder._check_template_file_exists(target):
      banner = format_missing_template_warning_banner(target)
      logger.warning("\n" + banner)
      diagnostics_registry.template_status = {
        "status": "empty",
        "template_count": 0,
        "templates_loaded": 0,
        "has_templates": False,
        "missing_file": True,
      }
      diagnostics_registry.add_warning(
        code="MISSING_TEMPLATE_PACK",
        message=f"Template pack missing at {target}.",
        severity="warning",
        remediation="Verify repository data/ directory contains initial_templates.json.",
      )
      return

    try:
      templates_data = TemplateSeeder._read_template_file(target)

      if db is not None:
        await TemplateSeeder._process_batch(db, templates_data)
        await db.commit()
      else:
        async with AsyncSessionLocal() as session:
          await TemplateSeeder._process_batch(session, templates_data)
          await session.commit()

      diagnostics_registry.template_status = {
        "status": "ready" if len(templates_data) > 0 else "empty",
        "template_count": len(templates_data),
        "templates_loaded": len(templates_data),
        "has_templates": len(templates_data) > 0,
        "missing_file": False,
      }
      if not templates_data:
        diagnostics_registry.add_warning(
          code="EMPTY_TEMPLATE_PACK",
          message=f"Template pack at {target} contains 0 templates.",
          severity="warning",
          remediation="Populate data/initial_templates.json with template objects.",
        )

      logger.info(f"✅ Template Seeding Complete: {len(templates_data)} items processed.")

    except json.JSONDecodeError as e:
      logger.error(f"❌ Invalid JSON in Content Pack: {e}")
      diagnostics_registry.template_status = {
        "status": "empty",
        "template_count": 0,
        "templates_loaded": 0,
        "has_templates": False,
        "missing_file": False,
      }
      diagnostics_registry.add_warning(
        code="CORRUPTED_TEMPLATE_PACK",
        message=f"Invalid JSON syntax in template pack: {e}",
        severity="error",
        remediation=f"Validate JSON formatting in {target}.",
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
    if data_list:
      await TemplateSeeder._ensure_templates_view(db)

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
      raw_desc = data.get("description")
      existing.description = str(raw_desc) if raw_desc is not None else ""
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


template_seeder = TemplateSeeder()
