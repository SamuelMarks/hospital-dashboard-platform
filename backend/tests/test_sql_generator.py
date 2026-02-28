import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.sql_generator import sql_generator
from app.services.llm_client import ArenaResponse
from app.models.feedback import ModelCandidate


def test_sql_cleaning_logic():
  """Test that the service correctly strips Markdown formatting."""
  raw_1 = "SELECT * FROM hospital_data LIMIT 10;"
  assert sql_generator._clean_sql_response(raw_1) == raw_1

  raw_2 = """```sql
    SELECT count(*) FROM hospital_data; 
    ```"""
  cleaned_2 = sql_generator._clean_sql_response(raw_2)
  assert cleaned_2 == "SELECT count(*) FROM hospital_data;"


@pytest.mark.asyncio
async def test_generation_flow_mocked():
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
  added_objects = []

  def side_effect_add(obj):
    if hasattr(obj, "is_selected") and obj.is_selected is None:
      obj.is_selected = False
    added_objects.append(obj)

  mock_db.add.side_effect = side_effect_add

  async def side_effect_persistence():
    for obj in added_objects:
      if not getattr(obj, "id", None):
        obj.id = uuid.uuid4()

  mock_db.flush = AsyncMock(side_effect=side_effect_persistence)
  mock_db.commit = AsyncMock(side_effect=side_effect_persistence)

  async def mock_refresh(instance, attribute_names=None):
    if not instance.id:
      instance.id = uuid.uuid4()
    if not hasattr(instance, "created_at") or not instance.created_at:
      instance.created_at = datetime.now(timezone.utc)

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
