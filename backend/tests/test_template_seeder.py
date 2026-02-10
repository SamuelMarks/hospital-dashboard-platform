"""
Tests for the template seeding service.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import template_seeder
from app.services.template_seeder import TemplateSeeder
from app.models.template import WidgetTemplate


class _DummySessionContext:
  def __init__(self, session):
    self._session = session

  async def __aenter__(self):
    return self._session

  async def __aexit__(self, exc_type, exc, tb):
    return False


@pytest.mark.asyncio
async def test_seed_defaults_skips_missing_file(monkeypatch) -> None:
  """Missing content pack should short-circuit without error."""
  monkeypatch.setattr(template_seeder.os.path, "exists", lambda *_: False)

  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_seed_defaults_handles_invalid_json(monkeypatch, tmp_path) -> None:
  """Invalid JSON should be caught and logged without raising."""
  bad_file = tmp_path / "bad.json"
  bad_file.write_text("{invalid", encoding="utf-8")

  monkeypatch.setattr(template_seeder, "DATA_FILE", str(bad_file))
  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_seed_defaults_happy_path(monkeypatch, tmp_path) -> None:
  """Valid JSON should invoke batch processing and commit."""
  seed_file = tmp_path / "templates.json"
  seed_file.write_text(
    json.dumps(
      [
        {"title": "T1", "description": "d1", "sql_template": "SELECT 1", "category": "A"},
        {"title": "T2", "description": "d2", "sql_template": "SELECT 2", "category": "B"},
      ]
    ),
    encoding="utf-8",
  )

  monkeypatch.setattr(template_seeder, "DATA_FILE", str(seed_file))

  session = MagicMock()
  session.commit = AsyncMock()

  monkeypatch.setattr(template_seeder, "AsyncSessionLocal", lambda: _DummySessionContext(session))
  monkeypatch.setattr(TemplateSeeder, "_process_batch", AsyncMock())

  await TemplateSeeder.seed_defaults()

  TemplateSeeder._process_batch.assert_awaited_once()
  session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_seed_defaults_handles_unexpected_exception(monkeypatch, tmp_path) -> None:
  """Unexpected exceptions should be caught and logged."""
  seed_file = tmp_path / "templates.json"
  seed_file.write_text("[]", encoding="utf-8")

  monkeypatch.setattr(template_seeder, "DATA_FILE", str(seed_file))

  def _boom(*_args, **_kwargs):
    raise RuntimeError("boom")

  monkeypatch.setattr(template_seeder.json, "load", _boom)

  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_process_batch_calls_upsert(monkeypatch) -> None:
  """Batch processing should invoke upsert for each item."""
  session = MagicMock()
  items = [
    {"title": "One", "sql_template": "SELECT 1", "category": "A"},
    {"title": "Two", "sql_template": "SELECT 2", "category": "B"},
  ]

  monkeypatch.setattr(TemplateSeeder, "_upsert_template", AsyncMock())

  await TemplateSeeder._process_batch(session, items)

  assert TemplateSeeder._upsert_template.await_count == 2


@pytest.mark.asyncio
async def test_upsert_template_updates_existing() -> None:
  """Existing templates should be updated in place."""
  existing = WidgetTemplate(
    title="T1",
    description="old",
    sql_template="SELECT 0",
    category="Old",
    parameters_schema={},
  )

  result = MagicMock()
  result.scalars.return_value.first.return_value = existing

  session = MagicMock()
  session.execute = AsyncMock(return_value=result)

  data = {"title": "T1", "description": "new", "sql_template": "SELECT 1", "category": "New"}

  await TemplateSeeder._upsert_template(session, data)

  assert existing.description == "new"
  assert existing.sql_template == "SELECT 1"
  assert existing.category == "New"
  session.add.assert_not_called()


@pytest.mark.asyncio
async def test_upsert_template_inserts_new() -> None:
  """New templates should be inserted."""
  result = MagicMock()
  result.scalars.return_value.first.return_value = None

  session = MagicMock()
  session.execute = AsyncMock(return_value=result)

  data = {"title": "T2", "description": "d", "sql_template": "SELECT 2", "category": "A"}

  await TemplateSeeder._upsert_template(session, data)

  session.add.assert_called_once()
