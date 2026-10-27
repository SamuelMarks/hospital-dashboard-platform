"""
AI API Router (Arena Edition).

Exposes endpoints for generating SQL, recording experiment feedback votes,
and executing read-only SQL previews.
"""

from typing import Annotated
from uuid import UUID

import duckdb
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.ai import (
  ModelInfo,
  SQLExecutionRequest,
  SQLExecutionResponse,
  SQLGenerationRequest,
)
from app.schemas.feedback import ExperimentResponse, FeedbackUpdate
from app.services.admin import get_admin_settings
from app.services.llm_client import llm_client
from app.services.runners.sql import run_sql_widget
from app.services.sql_generator import sql_generator

router = APIRouter()


@router.get("/models", response_model=list[ModelInfo])
async def list_available_models(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  show_all: bool = False,
  include_sql: bool = False,
  discover_ollama: bool = False,
) -> list[ModelInfo]:
  """
  Returns the list of currently configured LLMs and processors available for the Arena or Widgets.

  Args:
      current_user (User): Authenticated user session.
      db (AsyncSession): Active database session.
      show_all (bool): Whether to bypass admin model visibility filtering.
      include_sql (bool): Whether to include the `'SQL'` (`SQL [no model]`) processor option.
      discover_ollama (bool): Whether to dynamically query Ollama `/api/tags` for local models.

  Returns:
      list[ModelInfo]: List of configured LLM combatants and/or SQL processor.
  """
  _ = current_user
  admin_settings = await get_admin_settings(db) if not show_all else None
  if include_sql or discover_ollama:
    return await llm_client.get_available_processors_async(
      admin_settings=admin_settings,
      include_sql=include_sql,
      discover_ollama=discover_ollama,
    )
  return llm_client.get_available_models(admin_settings)


@router.post("/generate", response_model=ExperimentResponse)
async def generate_sql_comparison(
  request: SQLGenerationRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> ExperimentResponse:
  """
  Generates SQL using the Multi-LLM Arena.

  Args:
      request (SQLGenerationRequest): The prompt payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Database session for logging.

  Returns:
      ExperimentResponse: Object containing experiment ID and list of candidate SQLs.
  """
  res = await sql_generator.run_arena_experiment_result(user_query=request.prompt, db=db, user=current_user)
  return unwrap_or_raise_http(res)


@router.post(
  "/experiments/{experiment_id}/candidates/{candidate_id}/vote",
  response_model=ExperimentResponse,
)
async def vote_experiment_candidate(
  experiment_id: UUID,
  candidate_id: UUID,
  payload: FeedbackUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> ExperimentResponse:
  """
  Records a user vote and optional execution telemetry for an Arena `ModelCandidate`.

  Args:
      experiment_id (UUID): Target experiment UUID.
      candidate_id (UUID): Winning candidate UUID.
      payload (FeedbackUpdate): Selection flag and optional execution telemetry.
      current_user (User): Authenticated user session.
      db (AsyncSession): Active database session.

  Returns:
      ExperimentResponse: Updated experiment state with selected candidate reflected.
  """
  res = await sql_generator.record_feedback_result(
    experiment_id=experiment_id,
    candidate_id=candidate_id,
    payload=payload,
    db=db,
    user=current_user,
  )
  return unwrap_or_raise_http(res)


def _default_olap_conn() -> duckdb.DuckDBPyConnection | None:
  """
  Default dependency provider returning None so `execute_sql_preview` opens its own connection.

  Returns:
      duckdb.DuckDBPyConnection | None: Always None unless overridden in tests.
  """
  return None


@router.post("/execute", response_model=SQLExecutionResponse)
async def execute_sql_preview(
  request: SQLExecutionRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  olap_conn: Annotated[duckdb.DuckDBPyConnection | None, Depends(_default_olap_conn)] = None,
) -> SQLExecutionResponse:
  """
  Executes SQL (read-only) and returns a small preview result.
  Intended for Arena candidate comparison in the UI.

  Args:
      request (SQLExecutionRequest): SQL query and optional global filter parameters.
      current_user (User): Authenticated user session.
      olap_conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

  Returns:
      SQLExecutionResponse: Tabular rows, column names, or error details.
  """
  _ = current_user
  res = await sql_generator.execute_sql_preview_result(
    request=request,
    olap_conn=olap_conn,
    conn_factory=duckdb_manager.get_readonly_connection,
    sql_runner_fn=run_sql_widget,
  )
  return unwrap_or_raise_http(res)
