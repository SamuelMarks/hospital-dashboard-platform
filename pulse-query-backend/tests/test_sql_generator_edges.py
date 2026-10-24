"""
Additional tests for SQL generator edge cases against real database persistence.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.services.llm_client import ArenaResponse
from app.services.sql_generator import sql_generator
from app.services.sql_utils import process_global_filters


@pytest.mark.asyncio
async def test_get_strategy_implementation_variants() -> None:
  """Verify strategy resolution for cot-macro, rag-few-shot, and fallback."""
  cot = sql_generator._get_strategy_implementation("cot-macro")
  rag = sql_generator._get_strategy_implementation("rag-few-shot")
  default = sql_generator._get_strategy_implementation("unknown")

  assert cot.get_strategy_name() == "cot-macro"
  assert rag.get_strategy_name() == "rag-few-shot"
  assert default.get_strategy_name() == "zero-shot"


def test_process_global_filters_replaces_placeholders() -> None:
  """Ensure global filters inject department and date ranges."""
  sql = (
    "SELECT * FROM hospital_data "
    "WHERE 1=1 {{global_service}} "
    "AND 1=1 {{global_date_range}} "
    "AND start >= '{{global_start_date}}' "
    "AND end <= '{{global_end_date}}'"
  )

  result = process_global_filters(
    sql,
    {"dept": "Cardiology", "start_date": "2024-01-01", "end_date": "2024-02-01"},
  )

  assert "Clinical_Service = 'Cardiology'" in result
  assert "BETWEEN '2024-01-01' AND '2024-02-01'" in result
  assert "2024-01-01" in result
  assert "2024-02-01" in result

  result_no_range = process_global_filters(sql, {"dept": "Cardiology"})
  assert "{{global_date_range}}" not in result_no_range


@pytest.mark.asyncio
async def test_run_arena_experiment_dry_run(db_session: AsyncSession) -> None:
  """
  Dry run should bypass the LLM client, return a mock candidate, and persist to `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"dryrun_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  with patch.object(sql_generator.schema_svc, "get_schema_context_string", return_value="SCHEMA"):
    result = await sql_generator.run_arena_experiment(
      "How many visits?",
      db_session,
      user,
      strategy="zero-shot",
      dry_run=True,
    )

  assert result.candidates
  assert "SELECT 1" in result.candidates[0].generated_sql

  persisted = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == result.id))).scalars().first()
  assert persisted is not None

  # Also verify empty content / error response persistence in real DB
  with (
    patch.object(sql_generator.schema_svc, "get_schema_context_string", return_value="SCHEMA"),
    patch.object(
      sql_generator.llm,
      "generate_arena_competition",
      new=AsyncMock(return_value=[ArenaResponse("ErrModel", "err/v1", "", 5, "Provider timeout")]),
    ),
  ):
    err_result = await sql_generator.run_arena_experiment(
      "Failing prompt",
      db_session,
      user,
      strategy="zero-shot",
      dry_run=False,
    )

  err_cands = (
    (await db_session.execute(select(ModelCandidate).where(ModelCandidate.experiment_id == err_result.id)))
    .scalars()
    .all()
  )
  assert len(err_cands) == 1
  assert err_cands[0].generated_sql == ""
  assert err_cands[0].error_message == "Provider timeout"
