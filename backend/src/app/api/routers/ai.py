"""
AI API Router (Arena Edition).

Exposes the endpoint for generating SQL.
Now returns an `ExperimentResponse` containing multiple candidates for user comparison.
"""

from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.ai import SQLGenerationRequest, SQLExecutionRequest, SQLExecutionResponse, ModelInfo
from app.schemas.feedback import ExperimentResponse
from app.services.sql_generator import sql_generator
from app.database.duckdb import duckdb_manager
from app.services.runners.sql import run_sql_widget
from app.services.llm_client import llm_client

router = APIRouter()


@router.get("/models", response_model=List[ModelInfo])
def list_available_models(current_user: Annotated[User, Depends(deps.get_current_user)]) -> List[ModelInfo]:
  """
  Returns the list of currently configured LLMs available for the Arena.
  """
  return llm_client.get_available_models()


@router.post("/generate", response_model=ExperimentResponse)
async def generate_sql_comparison(
  request: SQLGenerationRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> ExperimentResponse:
  """
  Generates SQL usage the Multi-LLM Arena.

  This endpoint:
  1. Broadcasts the prompt to all configured LLMs.
  2. Persists the results as an Experiment.
  3. Returns a list of candidates so the frontend can display a comparison view.

  Args:
      request (SQLGenerationRequest): The prompt payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Database session for logging.

  Returns:
      ExperimentResponse: Object containing experiment ID and list of candidate SQLs.
  """
  if not request.prompt.strip():
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Prompt cannot be empty.",
    )

  try:
    # Use the new Swarm-capable method
    response = await sql_generator.run_arena_experiment(user_query=request.prompt, db=db, user=current_user)
    return response

  except RuntimeError as e:
    # If the Swarm has 0 providers configured
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=str(e),
    )
  except Exception as e:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"Arena Generation failed: {str(e)}",
    )


@router.post("/execute", response_model=SQLExecutionResponse)
async def execute_sql_preview(
  request: SQLExecutionRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> SQLExecutionResponse:
  """
  Executes SQL (read-only) and returns a small preview result.
  Intended for Arena candidate comparison in the UI.
  """
  if not request.sql.strip():
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="SQL cannot be empty.",
    )

  runnable_sql = sql_generator.process_global_filters(request.sql, request.global_params or {})

  conn = None
  try:
    conn = duckdb_manager.get_readonly_connection()
    cursor = conn.cursor()
    res = run_sql_widget(cursor, {"query": runnable_sql, "max_rows": request.max_rows})
  except Exception as e:
    res = {"data": [], "columns": [], "error": str(e)}
  finally:
    if conn:
      conn.close()

  return SQLExecutionResponse(**res)
