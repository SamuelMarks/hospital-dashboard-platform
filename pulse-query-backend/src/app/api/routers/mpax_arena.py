"""
API Router for the MPAX Arena integrations.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaRequest, MpaxArenaResponse
from app.services.mpax_arena_service import mpax_arena_service

router = APIRouter()


@router.post("/run", response_model=MpaxArenaResponse)
async def run_mpax_arena_mode(
  request: MpaxArenaRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> MpaxArenaResponse:
  """
  Executes an MPAX Arena evaluation mode.
  Modes: judge, translator, constraints, sql_vs_mpax, critic.

  Args:
      request (MpaxArenaRequest): Arena evaluation mode and scenario configuration.
      current_user (User): Authenticated user session.
      db (AsyncSession): Active transactional database session.

  Returns:
      MpaxArenaResponse: Evaluated candidate responses and ground-truth MPAX output.
  """
  res = await mpax_arena_service.run_mpax_arena_result(request, db, current_user)
  return unwrap_or_raise_http(res)


@router.post("/runs/{run_id}/candidates/{candidate_id}/vote", response_model=MpaxArenaResponse)
async def vote_mpax_arena_candidate(
  run_id: str,
  candidate_id: str,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> MpaxArenaResponse:
  """
  Records a winning vote for an LLM candidate in an MPAX Arena run.

  Args:
      run_id (str): UUID string identifying the MPAX Arena experiment.
      candidate_id (str): UUID string identifying the candidate voted for.
      current_user (User): Authenticated user session.
      db (AsyncSession): Active transactional database session.

  Returns:
      MpaxArenaResponse: Updated experiment results with is_selected true for winning candidate.
  """
  res = await mpax_arena_service.vote_candidate_result(run_id, candidate_id, db, current_user)
  return unwrap_or_raise_http(res)
