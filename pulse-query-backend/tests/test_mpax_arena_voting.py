"""
Unit and integration tests for MPAX Arena persistence, ownership enforcement, and candidate voting.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.result import Err, ErrorCode, Ok
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaCandidate, MpaxArenaRequest, MpaxArenaResponse
from app.services.mpax_arena_service import mpax_arena_service


def test_mpax_arena_models_repr() -> None:
  """Verifies __repr__ implementation on MpaxArenaRun and MpaxArenaCandidateRecord."""
  run_id = uuid.uuid4()
  cand_id = uuid.uuid4()

  run = MpaxArenaRun(
    id=run_id,
    user_id=uuid.uuid4(),
    prompt="Optimize ICU beds",
    mode="judge",
    ground_truth_mpax={"status": "optimal"},
  )
  assert f"MpaxArenaRun id={run_id}" in repr(run)
  assert "mode=judge" in repr(run)

  cand = MpaxArenaCandidateRecord(
    id=cand_id,
    run_id=run_id,
    model_name="gpt-4o",
    content="Recommended distribution: ICU: 12",
    sql_snippet="SELECT 1;",
    mpax_score=95,
    is_winner=True,
  )
  assert f"MpaxArenaCandidateRecord id={cand_id}" in repr(cand)
  assert "model=gpt-4o" in repr(cand)
  assert "is_winner=True" in repr(cand)


@pytest.mark.asyncio
async def test_vote_candidate_success(db_session: AsyncSession) -> None:
  """
  Verifies `vote_candidate_result` updates the winning candidate and resets siblings in `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(
    email=f"voter_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  db_session.add(user)
  await db_session.flush()

  run_id = uuid.uuid4()
  cand1_id = uuid.uuid4()
  cand2_id = uuid.uuid4()

  run_record = MpaxArenaRun(
    id=run_id,
    user_id=user.id,
    prompt="Bed capacity",
    mode="critic",
    ground_truth_mpax={"cost": 10},
  )
  cand1 = MpaxArenaCandidateRecord(
    id=cand1_id,
    run_id=run_id,
    model_name="model-1",
    content="content 1",
    is_winner=False,
  )
  cand2 = MpaxArenaCandidateRecord(
    id=cand2_id,
    run_id=run_id,
    model_name="model-2",
    content="content 2",
    is_winner=True,
  )
  db_session.add_all([run_record, cand1, cand2])
  await db_session.commit()

  res = await mpax_arena_service.vote_candidate_result(str(run_id), str(cand1_id), db_session, user)
  assert isinstance(res, Ok)

  assert res.value.experiment_id == str(run_id)
  winner = next(c for c in res.value.candidates if c.id == str(cand1_id))
  loser = next(c for c in res.value.candidates if c.id == str(cand2_id))
  assert winner.is_selected is True
  assert loser.is_selected is False

  await db_session.refresh(cand1)
  await db_session.refresh(cand2)
  assert cand1.is_winner is True
  assert cand2.is_winner is False


@pytest.mark.asyncio
async def test_vote_candidate_blocks_cross_user_tampering(db_session: AsyncSession) -> None:
  """Verifies User B cannot vote on User A's `MpaxArenaRun` in the database."""
  user_a = User(
    email=f"owner_a_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  user_b = User(
    email=f"intruder_b_{uuid.uuid4()}@hospital.org",
    hashed_password=security.get_password_hash("StrongPass123!"),
    is_active=True,
  )
  db_session.add_all([user_a, user_b])
  await db_session.flush()

  run_id = uuid.uuid4()
  cand_id = uuid.uuid4()
  run = MpaxArenaRun(id=run_id, user_id=user_a.id, prompt="ICU", mode="judge")
  cand = MpaxArenaCandidateRecord(id=cand_id, run_id=run_id, model_name="m1", content="c1", is_winner=False)
  db_session.add_all([run, cand])
  await db_session.commit()

  res = await mpax_arena_service.vote_candidate_result(str(run_id), str(cand_id), db_session, user_b)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.MPAX_RUN_NOT_FOUND


@pytest.mark.asyncio
async def test_vote_candidate_invalid_uuids(db_session: AsyncSession) -> None:
  """
  Verifies `vote_candidate_result` returns `Err(MPAX_RUN_NOT_FOUND)` when IDs are invalid UUIDs.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"u_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.commit()

  res1 = await mpax_arena_service.vote_candidate_result("not-a-uuid", str(uuid.uuid4()), db_session, user)
  assert isinstance(res1, Err)
  assert res1.error.code == ErrorCode.MPAX_RUN_NOT_FOUND

  res2 = await mpax_arena_service.vote_candidate_result(str(uuid.uuid4()), "not-a-uuid", db_session, user)
  assert isinstance(res2, Err)
  assert res2.error.code == ErrorCode.MPAX_RUN_NOT_FOUND


@pytest.mark.asyncio
async def test_vote_candidate_run_not_found(db_session: AsyncSession) -> None:
  """
  Verifies `vote_candidate_result` returns `Err(MPAX_RUN_NOT_FOUND)` when run does not exist in `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"u_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.commit()

  res = await mpax_arena_service.vote_candidate_result(str(uuid.uuid4()), str(uuid.uuid4()), db_session, user)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.MPAX_RUN_NOT_FOUND


@pytest.mark.asyncio
async def test_vote_candidate_not_in_run(db_session: AsyncSession) -> None:
  """
  Verifies `vote_candidate_result` returns `Err(MPAX_CANDIDATE_NOT_FOUND)` when candidate ID is not among run candidates.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"u_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.flush()

  run_id = uuid.uuid4()
  cand1_id = uuid.uuid4()
  other_cand_id = uuid.uuid4()

  run_record = MpaxArenaRun(
    id=run_id,
    user_id=user.id,
    prompt="Bed capacity",
    mode="critic",
  )
  cand1 = MpaxArenaCandidateRecord(
    id=cand1_id,
    run_id=run_id,
    model_name="model-1",
    content="content 1",
    is_winner=False,
  )
  db_session.add_all([run_record, cand1])
  await db_session.commit()

  res = await mpax_arena_service.vote_candidate_result(str(run_id), str(other_cand_id), db_session, user)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.MPAX_CANDIDATE_NOT_FOUND

  failing_db = MagicMock(spec=AsyncSession)
  failing_db.execute = AsyncMock(side_effect=RuntimeError("DB connection lost"))
  db_err = await mpax_arena_service.vote_candidate_result(str(run_id), str(cand1_id), failing_db, user)
  assert isinstance(db_err, Err)
  assert db_err.error.code == ErrorCode.INTERNAL_ERROR


@pytest.mark.asyncio
async def test_run_mpax_arena_persists_run(db_session: AsyncSession) -> None:
  """
  Verifies `run_mpax_arena_result` commits `MpaxArenaRun` and `MpaxArenaCandidateRecord` entities to `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.
  """
  user = User(email=f"persist_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(user)
  await db_session.commit()

  exp_id = str(uuid.uuid4())
  cand_id = str(uuid.uuid4())

  mock_response = MpaxArenaResponse(
    experiment_id=exp_id,
    mode="judge",
    ground_truth_mpax={"allocated": 5},
    candidates=[
      MpaxArenaCandidate(
        id=cand_id,
        model_name="test-model",
        content="test-response",
        is_selected=False,
        mpax_score=90,
      )
    ],
  )

  with patch.object(mpax_arena_service._strategies["judge"], "execute", new_callable=AsyncMock) as mock_judge:
    mock_judge.return_value = Ok(mock_response)

    req = MpaxArenaRequest(prompt="Test prompt", mode="judge")
    res = await mpax_arena_service.run_mpax_arena_result(req, db_session, user)
    assert isinstance(res, Ok)
    assert res.value.experiment_id == exp_id

  saved_run = (
    (await db_session.execute(select(MpaxArenaRun).where(MpaxArenaRun.id == uuid.UUID(exp_id)))).scalars().first()
  )
  assert saved_run is not None
  assert saved_run.prompt == "Test prompt"


@pytest.mark.asyncio
async def test_run_mpax_arena_persistence_failure_recovers() -> None:
  """Verifies `run_mpax_arena_result` rolls back gracefully if DB persistence fails."""
  mock_db = MagicMock(spec=AsyncSession)
  mock_db.add = MagicMock()
  mock_db.commit = AsyncMock(side_effect=RuntimeError("DB constraint error"))
  mock_db.rollback = AsyncMock()

  mock_user = MagicMock(spec=User)
  mock_user.id = uuid.uuid4()

  exp_id = str(uuid.uuid4())
  mock_response = MpaxArenaResponse(
    experiment_id=exp_id,
    mode="translator",
    candidates=[],
  )

  with patch.object(mpax_arena_service._strategies["translator"], "execute", new_callable=AsyncMock) as mock_trans:
    mock_trans.return_value = Ok(mock_response)

    req = MpaxArenaRequest(prompt="Test prompt", mode="translator")
    res = await mpax_arena_service.run_mpax_arena_result(req, mock_db, mock_user)
    assert isinstance(res, Ok)
    assert res.value.experiment_id == exp_id
    mock_db.rollback.assert_awaited_once()
