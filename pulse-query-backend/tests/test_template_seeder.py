"""
Tests for the template seeding service.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.template import WidgetTemplate
from app.services import template_seeder
from app.services.template_seeder import TemplateSeeder


class _DummySessionContext:
  """Async context manager test double yielding a mock SQLAlchemy session."""

  def __init__(self, session: MagicMock) -> None:
    """
    Initializes the context manager with a mock session.

    Args:
        session (MagicMock): Mock database session.
    """
    self._session = session

  async def __aenter__(self) -> MagicMock:
    """
    Enters the async context and returns the mock session.

    Returns:
        MagicMock: The wrapped mock session.
    """
    return self._session

  async def __aexit__(self, exc_type: object, exc: object, tb: object) -> bool:
    """
    Exits the async context without suppressing exceptions.

    Args:
        exc_type (object): Exception type if raised.
        exc (object): Exception instance if raised.
        tb (object): Traceback if raised.

    Returns:
        bool: Always False.
    """
    return False


@pytest.mark.asyncio
async def test_seed_defaults_skips_missing_file(monkeypatch: pytest.MonkeyPatch) -> None:
  """Missing content pack should short-circuit without error."""
  monkeypatch.setattr("app.services.template_seeder.os.path.exists", lambda *_: False)

  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_seed_defaults_handles_invalid_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """Invalid JSON should be caught and logged without raising."""
  bad_file = tmp_path / "bad.json"
  bad_file.write_text("{invalid", encoding="utf-8")

  monkeypatch.setattr(template_seeder, "DATA_FILE", str(bad_file))
  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_seed_defaults_happy_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
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
  mock_batch = AsyncMock()

  monkeypatch.setattr(template_seeder, "AsyncSessionLocal", lambda: _DummySessionContext(session))
  monkeypatch.setattr(TemplateSeeder, "_process_batch", mock_batch)

  await TemplateSeeder.seed_defaults()

  mock_batch.assert_awaited_once()
  session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_seed_defaults_handles_unexpected_exception(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """Unexpected exceptions should be caught and logged."""
  seed_file = tmp_path / "templates.json"
  seed_file.write_text("[]", encoding="utf-8")

  monkeypatch.setattr(template_seeder, "DATA_FILE", str(seed_file))

  def _boom(*_args: object, **_kwargs: object) -> None:
    """
    Raises a simulated runtime error during JSON loading.

    Args:
        *_args (object): Positional arguments.
        **_kwargs (object): Keyword arguments.

    Raises:
        RuntimeError: Always raised to test exception handling.
    """
    raise RuntimeError("boom")

  monkeypatch.setattr("app.services.template_seeder.json.load", _boom)

  await TemplateSeeder.seed_defaults()


@pytest.mark.asyncio
async def test_process_batch_calls_upsert(monkeypatch: pytest.MonkeyPatch) -> None:
  """Batch processing should invoke upsert for each item."""
  session = MagicMock()
  items = [
    {"title": "One", "sql_template": "SELECT 1", "category": "A"},
    {"title": "Two", "sql_template": "SELECT 2", "category": "B"},
  ]
  mock_upsert = AsyncMock()

  monkeypatch.setattr(TemplateSeeder, "_upsert_template", mock_upsert)

  await TemplateSeeder._process_batch(session, items)

  assert mock_upsert.await_count == 2


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
