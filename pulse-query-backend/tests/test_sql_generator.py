"""Tests for sql generator against real database persistence."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.services.llm_client import ArenaResponse
from app.services.sql_generator import sql_generator
from app.services.sql_utils import extract_sql_from_markdown


def test_sql_cleaning_logic() -> None:
  """Test that the service correctly strips Markdown formatting."""
  raw_1 = "SELECT * FROM hospital_data LIMIT 10;"
  assert extract_sql_from_markdown(raw_1) == raw_1

  raw_2 = """```sql
    SELECT count(*) FROM hospital_data;
    ```"""
  cleaned_2 = extract_sql_from_markdown(raw_2)
  assert cleaned_2 == "SELECT count(*) FROM hospital_data;"


@pytest.mark.asyncio
async def test_generation_flow_persists_experiment_and_candidates(db_session: AsyncSession) -> None:
  """
  Verifies `sql_generator.run_arena_experiment` invokes the Arena client and persists
  both `ExperimentLog` and `ModelCandidate` records in the real SQLite database.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"sqlgen_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  mock_sql = "SELECT department FROM hospital_data"
  nl = chr(10)
  mock_responses = [
    ArenaResponse(
      provider_name="GPT-4o",
      model_identifier="openai/gpt-4o",
      content=f"```sql{nl}{mock_sql}{nl}```",
      latency_ms=120,
    )
  ]

  with patch("app.services.sql_generator.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = mock_responses

    res = await sql_generator.run_arena_experiment("How many visits?", db_session, user)

    assert len(res.candidates) == 1
    assert res.candidates[0].generated_sql == mock_sql

    call_args = mock_llm.call_args[1]
    messages = call_args["messages"]
    user_content = messages[1]["content"]

    assert "Here is the database schema" in user_content
    assert "Question: How many visits?" in user_content

  # Verify persisted database state
  exp_row = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp_row is not None
  assert exp_row.prompt_text == "How many visits?"
  assert exp_row.user_id == user.id

  cand_rows = (
    (await db_session.execute(select(ModelCandidate).where(ModelCandidate.experiment_id == res.id))).scalars().all()
  )
  assert len(cand_rows) == 1
  assert cand_rows[0].generated_sql == mock_sql
  assert cand_rows[0].model_tag == "GPT-4o"
