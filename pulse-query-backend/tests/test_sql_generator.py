"""Tests for sql generator."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.feedback import ExperimentLog, ModelCandidate
from app.services.llm_client import ArenaResponse
from app.services.sql_generator import sql_generator


def test_sql_cleaning_logic() -> None:
  """Test that the service correctly strips Markdown formatting."""
  raw_1 = "SELECT * FROM hospital_data LIMIT 10;"
  assert sql_generator._clean_sql_response(raw_1) == raw_1

  raw_2 = """```sql
    SELECT count(*) FROM hospital_data;
    ```"""
  cleaned_2 = sql_generator._clean_sql_response(raw_2)
  assert cleaned_2 == "SELECT count(*) FROM hospital_data;"


@pytest.mark.asyncio
async def test_generation_flow_mocked() -> None:
  """
  Simulate a full Arena flow using mocks.
  Verifies that the service calls the multi-model client and persists data.
  """
  mock_sql = "SELECT department FROM hospital_data"

  mock_responses = [
    ArenaResponse(
      provider_name="GPT-4o", model_identifier="openai/gpt-4o", content=f"```sql\n{mock_sql}\n```", latency_ms=120
    )
  ]

  # Mock Dependencies
  mock_db = MagicMock()
  mock_db.add = MagicMock()

  mock_result = MagicMock()
  mock_result.scalars.return_value.all.return_value = []
  mock_db.execute = AsyncMock(return_value=mock_result)

  # Mock side-effects for persistence
  added_objects: list[ExperimentLog | ModelCandidate] = []

  def side_effect_add(obj: ExperimentLog | ModelCandidate) -> None:
    """
    Appends `obj` to `added_objects` and initializes `is_selected` if None.

    Args:
        obj (ExperimentLog | ModelCandidate): ORM object added to session.
    """
    if isinstance(obj, ModelCandidate) and obj.is_selected is None:
      obj.is_selected = False
    added_objects.append(obj)

  mock_db.add.side_effect = side_effect_add

  async def side_effect_persistence() -> None:
    """Assigns UUIDs to pending objects in `added_objects`."""
    for obj in added_objects:
      if not getattr(obj, "id", None):
        obj.id = uuid.uuid4()

  mock_db.flush = AsyncMock(side_effect=side_effect_persistence)
  mock_db.commit = AsyncMock(side_effect=side_effect_persistence)

  async def mock_refresh(instance: ExperimentLog, attribute_names: list[str] | None = None) -> None:
    """
    Populates `id`, `created_at`, and `candidates` on `instance`.

    Args:
        instance (ExperimentLog): ExperimentLog instance being refreshed.
        attribute_names (list[str] | None): Optional attribute names.
    """
    _ = attribute_names
    if not instance.id:
      instance.id = uuid.uuid4()
    if not hasattr(instance, "created_at") or not instance.created_at:
      instance.created_at = datetime.now(UTC)

    if hasattr(instance, "candidates"):
      cands = [obj for obj in added_objects if isinstance(obj, ModelCandidate)]
      instance.candidates = cands

  mock_db.refresh = AsyncMock(side_effect=mock_refresh)

  mock_user = MagicMock()
  mock_user.id = uuid.uuid4()

  with patch("app.services.sql_generator.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = mock_responses

    res = await sql_generator.run_arena_experiment("How many visits?", mock_db, mock_user)

    assert len(res.candidates) == 1
    assert res.candidates[0].generated_sql == mock_sql

    call_args = mock_llm.call_args[1]
    messages = call_args["messages"]
    user_content = messages[1]["content"]

    # Fix: ZeroShotStrategy uses "Here is the database schema", not "Database Schema"
    assert "Here is the database schema" in user_content
    assert "Question: How many visits?" in user_content
