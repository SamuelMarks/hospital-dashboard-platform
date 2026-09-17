"""
Unit and integration tests for MPAX Arena persistence and candidate voting.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaCandidate, MpaxArenaRequest, MpaxArenaResponse
from app.services.mpax_arena_service import mpax_arena_service


def test_mpax_arena_models_repr():
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
async def test_vote_candidate_success():
  """Verifies vote_candidate updates winning candidate and sets siblings to False."""
  run_id = uuid.uuid4()
  cand1_id = uuid.uuid4()
  cand2_id = uuid.uuid4()

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

  run_record = MpaxArenaRun(
    id=run_id,
    user_id=uuid.uuid4(),
    prompt="Bed capacity",
    mode="critic",
    ground_truth_mpax={"cost": 10},
    candidates=[cand1, cand2],
  )

  mock_db = MagicMock(spec=AsyncSession)
  mock_scalar_result = MagicMock()
  mock_scalar_result.scalars.return_value.first.return_value = run_record
  mock_db.execute = AsyncMock(return_value=mock_scalar_result)
  mock_db.commit = AsyncMock()

  mock_user = MagicMock(spec=User)

  res = await mpax_arena_service.vote_candidate(str(run_id), str(cand1_id), mock_db, mock_user)

  assert res.experiment_id == str(run_id)
  winner = next(c for c in res.candidates if c.id == str(cand1_id))
  loser = next(c for c in res.candidates if c.id == str(cand2_id))
  assert winner.is_selected is True
  assert loser.is_selected is False
  assert cand1.is_winner is True
  assert cand2.is_winner is False
  mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_vote_candidate_invalid_uuids():
  """Verifies vote_candidate raises ValueError when IDs are invalid UUIDs."""
  mock_db = MagicMock(spec=AsyncSession)
  mock_user = MagicMock(spec=User)

  with pytest.raises(ValueError, match="Invalid UUID format"):
    await mpax_arena_service.vote_candidate("not-a-uuid", str(uuid.uuid4()), mock_db, mock_user)

  with pytest.raises(ValueError, match="Invalid UUID format"):
    await mpax_arena_service.vote_candidate(str(uuid.uuid4()), "not-a-uuid", mock_db, mock_user)


@pytest.mark.asyncio
async def test_vote_candidate_run_not_found():
  """Verifies vote_candidate raises ValueError when run does not exist."""
  mock_db = MagicMock(spec=AsyncSession)
  mock_scalar_result = MagicMock()
  mock_scalar_result.scalars.return_value.first.return_value = None
  mock_db.execute = AsyncMock(return_value=mock_scalar_result)
  mock_user = MagicMock(spec=User)

  with pytest.raises(ValueError, match="MPAX Arena run not found"):
    await mpax_arena_service.vote_candidate(str(uuid.uuid4()), str(uuid.uuid4()), mock_db, mock_user)


@pytest.mark.asyncio
async def test_vote_candidate_not_in_run():
  """Verifies vote_candidate raises ValueError when candidate ID is not among run candidates."""
  run_id = uuid.uuid4()
  cand1_id = uuid.uuid4()
  other_cand_id = uuid.uuid4()

  cand1 = MpaxArenaCandidateRecord(
    id=cand1_id,
    run_id=run_id,
    model_name="model-1",
    content="content 1",
    is_winner=False,
  )
  run_record = MpaxArenaRun(
    id=run_id,
    user_id=uuid.uuid4(),
    prompt="Bed capacity",
    mode="critic",
    candidates=[cand1],
  )

  mock_db = MagicMock(spec=AsyncSession)
  mock_scalar_result = MagicMock()
  mock_scalar_result.scalars.return_value.first.return_value = run_record
  mock_db.execute = AsyncMock(return_value=mock_scalar_result)
  mock_user = MagicMock(spec=User)

  with pytest.raises(ValueError, match="Candidate not found in this MPAX Arena run"):
    await mpax_arena_service.vote_candidate(str(run_id), str(other_cand_id), mock_db, mock_user)


@pytest.mark.asyncio
async def test_run_mpax_arena_persists_run():
  """Verifies run_mpax_arena commits run and candidate entities to DB."""
  mock_db = MagicMock(spec=AsyncSession)
  mock_db.add = MagicMock()
  mock_db.commit = AsyncMock()
  mock_user = MagicMock(spec=User)
  mock_user.id = uuid.uuid4()

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

  with patch.object(mpax_arena_service, "_run_judge_mode", new_callable=AsyncMock) as mock_judge:
    mock_judge.return_value = mock_response

    req = MpaxArenaRequest(prompt="Test prompt", mode="judge")
    res = await mpax_arena_service.run_mpax_arena(req, mock_db, mock_user)

    assert res.experiment_id == exp_id
    assert mock_db.add.call_count == 2
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_mpax_arena_persistence_failure_recovers():
  """Verifies run_mpax_arena rolls back gracefully if DB persistence fails."""
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

  with patch.object(mpax_arena_service, "_run_translator_mode", new_callable=AsyncMock) as mock_trans:
    mock_trans.return_value = mock_response

    req = MpaxArenaRequest(prompt="Test prompt", mode="translator")
    res = await mpax_arena_service.run_mpax_arena(req, mock_db, mock_user)

    assert res.experiment_id == exp_id
    mock_db.rollback.assert_awaited_once()
