"""
Additional tests for SQL generator edge cases.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.sql_generator import sql_generator
from app.models.feedback import ModelCandidate


def _make_db():
  db = MagicMock()
  added = []

  def add_side_effect(obj):
    added.append(obj)

  db.add.side_effect = add_side_effect

  async def _assign_ids():
    for obj in added:
      if getattr(obj, "id", None) is None:
        obj.id = uuid.uuid4()

  async def _refresh(obj, attribute_names=None):
    if getattr(obj, "id", None) is None:
      obj.id = uuid.uuid4()
    if getattr(obj, "created_at", None) is None:
      obj.created_at = datetime.now(timezone.utc)
    if hasattr(obj, "candidates"):
      obj.candidates = [o for o in added if isinstance(o, ModelCandidate)]

  db.flush = AsyncMock(side_effect=_assign_ids)
  db.commit = AsyncMock(side_effect=_assign_ids)
  db.refresh = AsyncMock(side_effect=_refresh)

  return db


def test_strategy_factory_resolves_known_tags() -> None:
  """Strategy tags should resolve to their concrete implementations."""
  assert sql_generator._get_strategy_implementation("cot-macro").get_strategy_name() == "cot-macro"
  assert sql_generator._get_strategy_implementation("rag-few-shot").get_strategy_name() == "rag-few-shot"
  assert sql_generator._get_strategy_implementation("unknown").get_strategy_name() == "zero-shot"


def test_process_global_filters_injects_values() -> None:
  """Global filters should replace template tokens with user selections."""
  sql = (
    "SELECT * FROM t WHERE 1=1 {{global_service}} "
    "AND 1=1 {{global_date_range}} "
    "AND start >= '{{global_start_date}}' "
    "AND end <= '{{global_end_date}}'"
  )

  result = sql_generator.process_global_filters(
    sql,
    {"dept": "Cardiology", "start_date": "2024-01-01", "end_date": "2024-02-01"},
  )

  assert "Clinical_Service = 'Cardiology'" in result
  assert "BETWEEN '2024-01-01' AND '2024-02-01'" in result
  assert "2024-01-01" in result
  assert "2024-02-01" in result

  # Missing date range should clear the placeholder.
  result_no_range = sql_generator.process_global_filters(sql, {"dept": "Cardiology"})
  assert "{{global_date_range}}" not in result_no_range


@pytest.mark.asyncio
async def test_run_arena_experiment_dry_run() -> None:
  """Dry-run mode should skip LLM calls and still persist candidates."""
  db = _make_db()
  user = MagicMock()
  user.id = uuid.uuid4()

  with patch("app.services.sql_generator.schema_service.get_schema_context_string", return_value="schema"):
    result = await sql_generator.run_arena_experiment(
      "How many visits?",
      db,
      user,
      strategy="zero-shot",
      dry_run=True,
    )

  assert result.candidates
  assert "SELECT 1" in result.candidates[0].generated_sql
