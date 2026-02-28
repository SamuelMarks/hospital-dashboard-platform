"""
API Router for the MPAX Arena integrations.
"""

from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
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
  """
  if not request.prompt.strip():
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Prompt cannot be empty.",
    )
  if not request.mode:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Mode must be specified.",
    )

  try:
    response = await mpax_arena_service.run_mpax_arena(request, db, current_user)
    return response
  except ValueError as e:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=str(e),
    )
  except Exception as e:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"MPAX Arena failed: {str(e)}",
    )
