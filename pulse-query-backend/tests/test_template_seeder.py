"""
Integration and unit tests for the `TemplateSeeder` service against real persistence.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.diagnostics import diagnostics_registry
from app.models.template import WidgetTemplate
from app.services import template_seeder
from app.services.template_seeder import TemplateSeeder
from tests.typed_test_doubles import ExcTb, ExcType, ExcVal


class _RealSessionContext:
  """Async context manager yielding a real `AsyncSession` for testing `AsyncSessionLocal` branch."""

  def __init__(self, session: AsyncSession) -> None:
    """
    Initializes the context manager with a real database session.

    Args:
        session (AsyncSession): Active test database session.
    """
    self._session = session

  async def __aenter__(self) -> AsyncSession:
    """
    Enters the async context and returns the wrapped session.

    Returns:
        AsyncSession: Active test database session.
    """
    return self._session

  async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> bool:
    """
    Exits the async context without suppressing exceptions.

    Args:
        exc_type (ExcType): Exception type if raised.
        exc (ExcVal): Exception instance if raised.
        tb (ExcTb): Traceback if raised.

    Returns:
        bool: Always False.
    """
    _ = (exc_type, exc, tb)
    return False


@pytest.mark.asyncio
async def test_seed_defaults_skips_missing_file(tmp_path: Path) -> None:
  """Missing content pack should short-circuit, update diagnostics_registry, and not raise."""
  missing_file = tmp_path / "missing_templates.json"
  await TemplateSeeder.seed_defaults(data_file=missing_file)
  assert diagnostics_registry.template_status.missing_file is True
  assert diagnostics_registry.template_status.templates_loaded == 0


@pytest.mark.asyncio
async def test_seed_defaults_handles_invalid_json(tmp_path: Path) -> None:
  """Invalid JSON should be caught and recorded in diagnostics_registry without raising."""
  bad_file = tmp_path / "bad.json"
  bad_file.write_text("{invalid", encoding="utf-8")

  await TemplateSeeder.seed_defaults(data_file=bad_file)
  assert diagnostics_registry.template_status.has_templates is False
  assert any(w.code == "CORRUPTED_TEMPLATE_PACK" for w in diagnostics_registry.warnings)

  empty_file = tmp_path / "empty.json"
  empty_file.write_text("[]", encoding="utf-8")
  await TemplateSeeder.seed_defaults(data_file=empty_file, db=AsyncMock(spec=AsyncSession))
  assert diagnostics_registry.template_status.status == "empty"
  assert any(w.code == "EMPTY_TEMPLATE_PACK" for w in diagnostics_registry.warnings)


@pytest.mark.asyncio
async def test_seed_defaults_idempotent_insert_and_update_against_real_db(
  tmp_path: Path,
  db_session: AsyncSession,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """
  Verifies `TemplateSeeder.seed_defaults` inserts new `WidgetTemplate` records into the database
  and idempotently updates existing records on subsequent runs without duplicating rows.
  """
  seed_file = tmp_path / "templates.json"
  seed_file.write_text(
    json.dumps(
      [
        {
          "title": "Seeder Test Template 1",
          "description": "Initial description 1",
          "sql_template": "SELECT 1 AS val",
          "category": "Capacity",
          "parameters_schema": {"type": "object"},
        },
        {
          "title": "Seeder Test Template 2",
          "description": "Initial description 2",
          "sql_template": "SELECT 2 AS val",
          "category": "Flow",
        },
      ]
    ),
    encoding="utf-8",
  )

  # 1. Seed using injected `db=db_session`
  await TemplateSeeder.seed_defaults(data_file=seed_file, db=db_session)
  assert diagnostics_registry.template_status.templates_loaded == 2
  assert diagnostics_registry.template_status.has_templates is True

  rows = (
    (
      await db_session.execute(
        select(WidgetTemplate).where(WidgetTemplate.title.in_(["Seeder Test Template 1", "Seeder Test Template 2"]))
      )
    )
    .scalars()
    .all()
  )
  assert len(rows) == 2
  by_title = {r.title: r for r in rows}
  assert by_title["Seeder Test Template 1"].sql_template == "SELECT 1 AS val"
  assert by_title["Seeder Test Template 2"].sql_template == "SELECT 2 AS val"

  # 2. Modify JSON and re-seed via `AsyncSessionLocal` branch (`db=None`) to verify idempotent update
  seed_file.write_text(
    json.dumps(
      [
        {
          "title": "Seeder Test Template 1",
          "description": None,
          "sql_template": "SELECT 100 AS updated_val",
          "category": "UpdatedCategory",
          "parameters_schema": {"type": "object", "properties": {}},
        },
        {
          "title": "Seeder Test Template 2",
          "description": "Updated description 2",
          "sql_template": "SELECT 200 AS updated_val",
          "category": "Flow",
        },
      ]
    ),
    encoding="utf-8",
  )

  monkeypatch.setattr(template_seeder, "AsyncSessionLocal", lambda: _RealSessionContext(db_session))
  await TemplateSeeder.seed_defaults(data_file=seed_file, db=None)

  updated_rows = (
    (
      await db_session.execute(
        select(WidgetTemplate).where(WidgetTemplate.title.in_(["Seeder Test Template 1", "Seeder Test Template 2"]))
      )
    )
    .scalars()
    .all()
  )
  assert len(updated_rows) == 2
  updated_by_title = {r.title: r for r in updated_rows}
  assert updated_by_title["Seeder Test Template 1"].description == ""
  assert updated_by_title["Seeder Test Template 1"].sql_template == "SELECT 100 AS updated_val"
  assert updated_by_title["Seeder Test Template 1"].category == "UpdatedCategory"
  assert updated_by_title["Seeder Test Template 2"].description == "Updated description 2"
  assert updated_by_title["Seeder Test Template 2"].sql_template == "SELECT 200 AS updated_val"


@pytest.mark.asyncio
async def test_seed_defaults_handles_unexpected_exception(tmp_path: Path) -> None:
  """Unexpected database exceptions should be caught and recorded in diagnostics_registry."""
  seed_file = tmp_path / "templates.json"
  seed_file.write_text(
    json.dumps([{"title": "Boom", "sql_template": "SELECT 1", "category": "A"}]),
    encoding="utf-8",
  )

  failing_db = MagicMock(spec=AsyncSession)
  failing_db.execute = AsyncMock(side_effect=RuntimeError("database connection lost"))

  await TemplateSeeder.seed_defaults(data_file=seed_file, db=failing_db)
  assert any(w.code == "TEMPLATE_SEEDING_ERROR" for w in diagnostics_registry.warnings)


@pytest.mark.asyncio
async def test_template_seeder_instance_and_postgres_view_branch(tmp_path: Path, db_session: AsyncSession) -> None:
  """TemplateSeeder instance methods (`__init__`, `seed_Async`, `_ensure_templates_view`) should work across dialects."""
  seed_file = tmp_path / "instance_templates.json"
  seed_file.write_text(
    json.dumps(
      [{"title": "Instance Seeder Template", "description": "Desc", "sql_template": "SELECT 1", "category": "Ops"}]
    ),
    encoding="utf-8",
  )
  seeder = TemplateSeeder(file_path=seed_file)
  assert seeder.file_path == seed_file.resolve()

  count = await seeder.seed_Async(db_session)
  assert count == 1

  # Test postgresql dialect branch on _ensure_templates_view
  pg_mock_db = AsyncMock()
  pg_bind = MagicMock()
  pg_bind.dialect.name = "postgresql"
  pg_mock_db.bind = pg_bind
  pg_mock_db.get_bind = MagicMock(return_value=pg_bind)
  await TemplateSeeder._ensure_templates_view(pg_mock_db)
  pg_mock_db.execute.assert_awaited_once()

  # Test get_bind exception fallback branch on _ensure_templates_view
  unbound_mock_db = AsyncMock()
  unbound_mock_db.get_bind = MagicMock(side_effect=RuntimeError("unbound session"))
  await TemplateSeeder._ensure_templates_view(unbound_mock_db)
  unbound_mock_db.execute.assert_awaited_once()


def test_isolated_subprocess_mapper_configuration_and_seed_script(tmp_path: Path) -> None:
  """
  Verifies that importing `app.services.template_seeder` or running `scripts/seed_templates.py`
  in a fresh Python interpreter registers all dependent SQLAlchemy ORM mappers (including `User`
  and `Dashboard`) and executes idempotent seeding without `InvalidRequestError`.
  """
  import os
  import subprocess
  import sys

  backend_root = Path(__file__).resolve().parents[1]
  sqlite_db = tmp_path / "isolated_seed.db"
  env = os.environ.copy()
  env["PYTHONPATH"] = str(backend_root / "src")
  env["DATABASE_URL"] = f"sqlite+aiosqlite:///{sqlite_db}"

  code = (
    "import asyncio\n"
    "from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine\n"
    "from sqlalchemy.orm import configure_mappers\n"
    "from app.database.postgres import Base\n"
    "from app.services.template_seeder import template_seeder\n"
    "import scripts.seed_templates as seed_mod\n"
    "configure_mappers()\n"
    "async def _init():\n"
    f"  eng = create_async_engine('sqlite+aiosqlite:///{sqlite_db}')\n"
    "  async with eng.begin() as conn:\n"
    "    await conn.run_sync(Base.metadata.create_all)\n"
    "  seed_mod.AsyncSessionLocal = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)\n"
    "  count1 = await seed_mod.seed_templates()\n"
    "  count2 = await seed_mod.seed_templates()\n"
    "  assert count1 >= 30 and count2 == count1\n"
    "  await eng.dispose()\n"
    "asyncio.run(_init())\n"
  )
  proc = subprocess.run(
    [sys.executable, "-c", code],
    cwd=str(backend_root),
    env=env,
    capture_output=True,
    text=True,
    check=False,
  )
  assert proc.returncode == 0, f"Isolated seed failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
