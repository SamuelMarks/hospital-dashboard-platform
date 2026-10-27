"""
Template Seeding Service.

This module provides the logic to populate the database with the initial "Pulse Content Pack"
automatically at application startup. It reads the `initial_templates.json` file and
performs an idempotent upsert (insert or update) for each template.
"""

from collections.abc import Mapping, Sequence
from pathlib import Path
import json
import logging
import os

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_ROOT
from app.core.diagnostics import (
  TemplateDiagnosticState,
  diagnostics_registry,
  format_missing_template_warning_banner,
)
from app.database.postgres import AsyncSessionLocal
from app.models import register_orm_models
from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate
from app.schemas.json_types import JsonObject, JsonValue
from app.services.sql_utils import interpolate_template_parameters

register_orm_models()
DATA_FILE = str((BACKEND_ROOT / "data" / "initial_templates.json").resolve())

logger = logging.getLogger("template_seeder")


class TemplateSeedSchema(BaseModel):
  """
  Strongly typed Pydantic schema for a template seed entry in `initial_templates.json`.

  Attributes:
      title (str): Unique display title of the template.
      description (str | None): Optional human-readable description.
      sql_template (str): Parameterized DuckDB SQL template string.
      category (str): Analytical category identifier.
      parameters_schema (JsonObject): JSON Schema describing template parameters.
  """

  model_config = ConfigDict(extra="allow")

  title: str
  description: str | None = None
  sql_template: str
  category: str
  parameters_schema: JsonObject = Field(default_factory=dict)


def _coerce_template_seed(item: TemplateSeedSchema | Mapping[str, JsonValue]) -> TemplateSeedSchema:
  """
  Coerces a `TemplateSeedSchema` or raw dictionary into a validated `TemplateSeedSchema`.

  Args:
      item (TemplateSeedSchema | Mapping[str, JsonValue]): Template entry object or dictionary.

  Returns:
      TemplateSeedSchema: Validated `TemplateSeedSchema` model instance.
  """
  if isinstance(item, TemplateSeedSchema):
    return item
  raw_schema = item.get("parameters_schema")
  normalized_schema: JsonObject = dict(raw_schema) if isinstance(raw_schema, Mapping) else {}
  raw_desc = item.get("description")
  return TemplateSeedSchema(
    title=str(item["title"]),
    description=str(raw_desc) if raw_desc is not None else None,
    sql_template=str(item["sql_template"]),
    category=str(item["category"]),
    parameters_schema=normalized_schema,
  )


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
  def _read_template_file(data_file: str | Path | None = None) -> list[TemplateSeedSchema]:
    """
    Reads and parses `data_file` (or `DATA_FILE`) from disk into `TemplateSeedSchema` instances.

    Args:
        data_file (str | Path | None): Optional path override.

    Returns:
        list[TemplateSeedSchema]: Parsed and validated list of `TemplateSeedSchema` entries.
    """
    target = str(data_file) if data_file is not None else DATA_FILE
    with open(target, "r", encoding="utf-8") as f:
      raw_data: list[JsonObject] = json.load(f)
      return [_coerce_template_seed(entry) for entry in raw_data]

  @staticmethod
  async def _ensure_templates_view(db: AsyncSession) -> None:
    """
    Creates the `templates` compatibility SQL view over `widget_templates` for PostgreSQL or SQLite.

    Args:
        db (AsyncSession): Active database session.
    """
    dialect_name = ""
    try:
      bind = db.get_bind()
      dialect_name = str(bind.dialect.name)
    except (SQLAlchemyError, AttributeError, RuntimeError):
      dialect_name = ""
    sql = (
      "CREATE OR REPLACE VIEW templates AS SELECT * FROM widget_templates"
      if dialect_name == "postgresql"
      else "CREATE VIEW IF NOT EXISTS templates AS SELECT * FROM widget_templates"
    )
    await db.execute(text(sql))

  async def seed_Async(
    self,
    db: AsyncSession,
    templates_data: Sequence[TemplateSeedSchema | JsonObject] | None = None,
  ) -> int:
    """
    Seeds templates into the provided `db` session and ensures the `templates` view exists.

    Args:
        db (AsyncSession): Active database session.
        templates_data (Sequence[TemplateSeedSchema | JsonObject] | None): Optional pre-parsed template list; reads `self.file_path` if None.

    Returns:
        int: Number of template items processed.
    """
    items: list[TemplateSeedSchema | JsonObject] = (
      list(templates_data) if templates_data is not None else list(self._read_template_file(self.file_path))
    )
    await self._process_batch(db, items)
    await self._ensure_templates_view(db)
    await db.commit()
    diagnostics_registry.template_status = TemplateDiagnosticState(
      status="ready" if len(items) > 0 else "empty",
      template_count=len(items),
      templates_loaded=len(items),
      has_templates=len(items) > 0,
      missing_file=False,
    )
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
      logger.warning(f"{chr(10)}{banner}")
      diagnostics_registry.template_status = TemplateDiagnosticState(
        status="empty",
        template_count=0,
        templates_loaded=0,
        has_templates=False,
        missing_file=True,
      )
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

      diagnostics_registry.template_status = TemplateDiagnosticState(
        status="ready" if len(templates_data) > 0 else "empty",
        template_count=len(templates_data),
        templates_loaded=len(templates_data),
        has_templates=len(templates_data) > 0,
        missing_file=False,
      )
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
      diagnostics_registry.template_status = TemplateDiagnosticState(
        status="empty",
        template_count=0,
        templates_loaded=0,
        has_templates=False,
        missing_file=False,
      )
      diagnostics_registry.add_warning(
        code="CORRUPTED_TEMPLATE_PACK",
        message=f"Invalid JSON syntax in template pack: {e}",
        severity="error",
        remediation=f"Validate JSON formatting in {target}.",
      )
    except (SQLAlchemyError, ValidationError, OSError, RuntimeError, ValueError, TypeError, KeyError) as e:
      logger.exception(f"❌ Unexpected seeding error: {e}")
      diagnostics_registry.add_warning(
        code="TEMPLATE_SEEDING_ERROR",
        message=f"Unexpected error while seeding templates: {e}",
        severity="error",
        remediation="Check PostgreSQL connection and template schema compatibility.",
      )

  @staticmethod
  async def _process_batch(db: AsyncSession, data_list: Sequence[TemplateSeedSchema | JsonObject]) -> None:
    """
    Iterates through the data list, upserts each template record, and synchronizes
    existing 'Hospital Command Center' widgets with the updated template SQL.

    Args:
        db (AsyncSession): Database session.
        data_list (Sequence[TemplateSeedSchema | JsonObject]): Validated template seed entries or dictionaries.
    """
    if not data_list:
      return
    for item in data_list:
      await TemplateSeeder._upsert_template(db, item)
    await TemplateSeeder._ensure_templates_view(db)
    await TemplateSeeder._sync_command_center_widgets(db, data_list)

  @staticmethod
  async def _sync_command_center_widgets(db: AsyncSession, data_list: Sequence[TemplateSeedSchema | JsonObject]) -> None:
    """
    Updates existing 'Hospital Command Center' SQL widgets whose titles match seeded templates
    so their queries stay in sync with the latest `initial_templates.json` definitions.

    Args:
        db (AsyncSession): Active database session.
        data_list (Sequence[TemplateSeedSchema | JsonObject]): Seeded template definitions.
    """
    interpolated_by_title: dict[str, str] = {}
    for item in data_list:
      if isinstance(item, TemplateSeedSchema):
        interpolated_by_title[item.title] = interpolate_template_parameters(item.sql_template, item.parameters_schema)
      else:
        title = item.get("title")
        sql_tmpl = item.get("sql_template")
        if isinstance(title, str) and isinstance(sql_tmpl, str):
          schema = item.get("parameters_schema")
          interpolated_by_title[title] = interpolate_template_parameters(
            sql_tmpl, schema if isinstance(schema, dict) else None
          )

    if not interpolated_by_title:
      return

    stmt = (
      select(Widget)
      .join(Dashboard, Widget.dashboard_id == Dashboard.id)
      .where(
        Dashboard.name.like("Hospital Command Center%"),
        Widget.type == "SQL",
        Widget.title.in_(list(interpolated_by_title.keys())),
      )
    )
    res = await db.execute(stmt)
    widgets = list(res.scalars().all())
    for widget in widgets:
      new_sql = interpolated_by_title.get(widget.title)
      if new_sql and isinstance(widget.config, dict) and widget.config.get("query") != new_sql:
        updated_cfg = dict(widget.config)
        updated_cfg["query"] = new_sql
        widget.config = updated_cfg

  @staticmethod
  async def _upsert_template(db: AsyncSession, data: TemplateSeedSchema | JsonObject) -> None:
    """
    Insert a new template or Update an existing one based on the unique 'title'.

    Args:
        db (AsyncSession): Active database session.
        data (TemplateSeedSchema | JsonObject): Validated `TemplateSeedSchema` or dictionary containing template fields.
    """
    seed = _coerce_template_seed(data)
    title = seed.title
    schema_obj = seed.parameters_schema

    # Check for existence by Title
    query = select(WidgetTemplate).where(WidgetTemplate.title == title)
    result = await db.execute(query)
    existing = result.scalars().first()

    if existing:
      # Update existing record (migration strategy: newest JSON always wins)
      existing.description = seed.description if seed.description is not None else ""
      existing.sql_template = seed.sql_template
      existing.category = seed.category
      existing.parameters_schema = schema_obj
    else:
      # Create new record
      new_template = WidgetTemplate(
        title=title,
        description=seed.description,
        sql_template=seed.sql_template,
        category=seed.category,
        parameters_schema=schema_obj,
      )
      db.add(new_template)


template_seeder = TemplateSeeder()
