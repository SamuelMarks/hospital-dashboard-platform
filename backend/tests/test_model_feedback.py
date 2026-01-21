"""
Tests for Feedback Persistence.

Verifies the integrity of the 'ExperimentLog' and 'ModelCandidate' database models.
Ensures relations work correctly, foreign keys are enforced, and feedback
flags can be updated.
"""

import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Import models
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User


@pytest.fixture
async def seed_user(db_session: AsyncSession) -> User:
  """
  Creates a temporary user for linking experiments.

  Args:
      db_session (AsyncSession): Active database test session.

  Returns:
      User: Persisted user object.
  """
  user = User(
    email=f"tester_{uuid.uuid4()}@bench.mark",
    hashed_password="hashed_secret",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)
  return user


@pytest.mark.asyncio
async def test_create_experiment_flow(db_session: AsyncSession, seed_user: User) -> None:
  """
  Verify that an experiment log can be created and linked to a user.
  """
  # 1. Create Experiment Log
  experiment = ExperimentLog(
    user_id=seed_user.id,
    prompt_text="Show me the bottleneck units.",
    prompt_strategy="few-shot-rag",
  )
  db_session.add(experiment)
  await db_session.commit()
  await db_session.refresh(experiment)

  # 2. Verification
  assert experiment.id is not None
  assert experiment.prompt_text == "Show me the bottleneck units."
  assert experiment.created_at is not None

  # 3. Verify Foreign Key Logic
  result = await db_session.execute(select(ExperimentLog).where(ExperimentLog.user_id == seed_user.id))
  fetched = result.scalars().first()
  assert fetched is not None
  assert fetched.id == experiment.id


@pytest.mark.asyncio
async def test_add_candidates_to_experiment(db_session: AsyncSession, seed_user: User) -> None:
  """
  Verify that multiple model candidates can be attached to an experiment.
  """
  # 1. Create Parent Experiment
  experiment = ExperimentLog(user_id=seed_user.id, prompt_text="Compare ICU vs PCU", prompt_strategy="zero-shot")
  db_session.add(experiment)
  await db_session.commit()

  # 2. Add Candidates (Blind Arena Style)
  c1 = ModelCandidate(
    experiment_id=experiment.id,
    model_identifier="gemini-1.5-pro",
    model_tag="Model A",
    generated_sql="SELECT * FROM data",
    latency_ms=1200,
  )
  c2 = ModelCandidate(
    experiment_id=experiment.id,
    model_identifier="gpt-4-turbo",
    model_tag="Model B",
    generated_sql="WITH cte AS...",
    latency_ms=1500,
  )
  db_session.add_all([c1, c2])
  await db_session.commit()

  # 3. Verification via Relationship
  # Reload experiment with relationships
  await db_session.refresh(experiment, attribute_names=["candidates"])

  assert len(experiment.candidates) == 2
  tags = {c.model_tag for c in experiment.candidates}
  assert "Model A" in tags
  assert "Model B" in tags


@pytest.mark.asyncio
async def test_feedback_selection_update(db_session: AsyncSession, seed_user: User) -> None:
  """
  Verify that a candidate can be updated to reflect user selection ("Win").
  """
  # 1. Setup
  experiment = ExperimentLog(user_id=seed_user.id, prompt_text="Test", prompt_strategy="test")
  db_session.add(experiment)
  await db_session.commit()

  candidate = ModelCandidate(
    experiment_id=experiment.id,
    model_identifier="claude-3-opus",
    model_tag="Candidate 1",
    generated_sql="SELECT 1",
    is_selected=False,
  )
  db_session.add(candidate)
  await db_session.commit()

  # 2. Simulate User Selection via Update
  # Select the candidate by ID
  query = select(ModelCandidate).where(ModelCandidate.id == candidate.id)
  result = await db_session.execute(query)
  target = result.scalars().first()

  assert target.is_selected is False  # default

  target.is_selected = True
  target.execution_success = True
  await db_session.commit()

  # 3. Verify Persistence
  result_final = await db_session.execute(query)
  target_final = result_final.scalars().first()
  assert target_final.is_selected is True
  assert target_final.execution_success is True


@pytest.mark.asyncio
async def test_cascade_delete(db_session: AsyncSession, seed_user: User) -> None:
  """
  Verify that deleting an experiment log also deletes its candidates
  (Cleanup integrity).
  """
  # 1. Setup
  exp = ExperimentLog(user_id=seed_user.id, prompt_text="Temp", prompt_strategy="temp")
  db_session.add(exp)
  await db_session.commit()

  cand = ModelCandidate(
    experiment_id=exp.id,
    model_identifier="temp-model",
    model_tag="Temp",
    generated_sql="SELECT 1",
  )
  db_session.add(cand)
  await db_session.commit()

  cand_id = cand.id

  # 2. Delete Experiment
  await db_session.delete(exp)
  await db_session.commit()

  # 3. Check Candidate is gone
  result = await db_session.execute(select(ModelCandidate).where(ModelCandidate.id == cand_id))
  assert result.scalars().first() is None
