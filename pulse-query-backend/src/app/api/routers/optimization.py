"""
FastAPI Router for the LLM + JAX + MPAX Hospital Operations Optimization Platform.

Exposes endpoints under `/api/v1/optimization` for:
- Partner institution profiles (`GET /institutions`)
- Model compendium (`GET /models`)
- Quick Actions metadata and execution (`GET /quick-actions`, `POST /quick-actions/{action_id}`)
- Stateless JAX/MPAX optimization solves (`POST /solve`)
- Stateful iterative optimization sessions (`POST /sessions`, `GET /sessions`,
  `GET /sessions/{session_id}`, `DELETE /sessions/{session_id}`, `POST /sessions/{session_id}/iterate`)
- Qualitative & quantitative user experience surveys (`POST /surveys`, `GET /surveys/summary`)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.optimization import (
  InstitutionProfileSchema,
  ModelCompendiumEntrySchema,
  OptimizationEvaluationSummaryResponse,
  OptimizationIterationRequest,
  OptimizationIterationResponse,
  OptimizationSessionCreate,
  OptimizationSessionResponse,
  OptimizationSolutionPayload,
  OptimizationSolveRequest,
  OptimizationSurveyCreate,
  OptimizationSurveyResponse,
  QuickActionDefinitionSchema,
  QuickActionExecutionRequest,
  QuickActionExecutionResponse,
)
from app.services.optimization import (
  list_institution_profiles,
  list_model_compendium,
  list_quick_actions,
  llm_optimization_copilot,
)

router = APIRouter()


@router.get("/institutions", response_model=list[InstitutionProfileSchema])
async def get_optimization_institutions(
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> list[InstitutionProfileSchema]:
  """
  Lists all partner hospital institution profiles and their operational baseline parameters.

  Args:
      current_user (User): Authenticated hospital user.

  Returns:
      list[InstitutionProfileSchema]: Partner hospital profiles.
  """
  _ = current_user
  return list_institution_profiles()


@router.get("/models", response_model=list[ModelCompendiumEntrySchema])
async def get_optimization_model_compendium(
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> list[ModelCompendiumEntrySchema]:
  """
  Lists the compendium of out-of-the-box, JAX/TPU fine-tuned, and LiteRT on-device models.

  Args:
      current_user (User): Authenticated hospital user.

  Returns:
      list[ModelCompendiumEntrySchema]: Supported LLM and LiteRT models.
  """
  _ = current_user
  return list_model_compendium()


@router.get("/quick-actions", response_model=list[QuickActionDefinitionSchema])
async def get_optimization_quick_actions(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  use_case: Annotated[str | None, Query(description="Optional use case filter")] = None,
) -> list[QuickActionDefinitionSchema]:
  """
  Lists Quick Action buttons available in the Hospital Optimization Workspace.

  Args:
      current_user (User): Authenticated hospital user.
      use_case (str | None): Optional optimization use case filter.

  Returns:
      list[QuickActionDefinitionSchema]: Quick Action button definitions.
  """
  _ = current_user
  return list_quick_actions(use_case=use_case)


@router.post("/quick-actions/{action_id}", response_model=QuickActionExecutionResponse)
async def execute_optimization_quick_action(
  action_id: str,
  request: QuickActionExecutionRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> QuickActionExecutionResponse:
  """
  Executes a deterministic Quick Action (`patient_days_by_unit`, `patient_days_by_service`,
  `combined_analysis`, `summary_statistics`, `optimize_service_units`, `smooth_surgical_schedule`,
  or `optimize_nurse_staffing`).

  Args:
      action_id (str): Quick Action identifier.
      request (QuickActionExecutionRequest): Institution and use-case request parameters.
      current_user (User): Authenticated hospital user.

  Returns:
      QuickActionExecutionResponse: Tabular rows and optional solved MPAX payload.
  """
  _ = current_user
  res = llm_optimization_copilot.execute_quick_action_result(action_id, request)
  return unwrap_or_raise_http(res)


@router.post("/solve", response_model=OptimizationSolutionPayload)
async def solve_optimization_stateless(
  request: OptimizationSolveRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationSolutionPayload:
  """
  Solves Use Case 1, Use Case 2, or Use Case 3 statelessly in JAX/MPAX and evaluates
  against the JAX Discrete Event Simulation (DES) expert baseline.

  Args:
      request (OptimizationSolveRequest): Stateless optimization solve payload.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationSolutionPayload: Solved assignments/schedule and DES baseline metrics.
  """
  _ = current_user
  res = llm_optimization_copilot.solve_stateless_result(request)
  return unwrap_or_raise_http(res)


@router.post("/sessions", response_model=OptimizationSessionResponse)
async def create_optimization_session(
  payload: OptimizationSessionCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationSessionResponse:
  """
  Creates a new iterative Hospital Optimization session for Use Case 1, 2, or 3.

  Args:
      payload (OptimizationSessionCreate): Session creation parameters.
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationSessionResponse: Created session state with initial MPAX baseline solution.
  """
  res = await llm_optimization_copilot.create_session_result(payload, db, current_user)
  return unwrap_or_raise_http(res)


@router.get("/sessions", response_model=list[OptimizationSessionResponse])
async def list_optimization_sessions(
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> list[OptimizationSessionResponse]:
  """
  Lists all iterative Hospital Optimization sessions owned by the authenticated user.

  Args:
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      list[OptimizationSessionResponse]: User's optimization sessions.
  """
  res = await llm_optimization_copilot.list_sessions_result(db, current_user)
  return unwrap_or_raise_http(res)


@router.get("/sessions/{session_id}", response_model=OptimizationSessionResponse)
async def get_optimization_session(
  session_id: str,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationSessionResponse:
  """
  Retrieves a specific Hospital Optimization session and its iteration history.

  Args:
      session_id (str): Target session UUID string.
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationSessionResponse: Session state and chronological iteration history.
  """
  res = await llm_optimization_copilot.get_session_result(session_id, db, current_user)
  return unwrap_or_raise_http(res)


@router.delete("/sessions/{session_id}", response_model=dict[str, str])
async def delete_optimization_session(
  session_id: str,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> dict[str, str]:
  """
  Deletes an iterative Hospital Optimization session owned by the authenticated user.

  Args:
      session_id (str): Target session UUID string.
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      dict[str, str]: Deletion confirmation dictionary.
  """
  res = await llm_optimization_copilot.delete_session_result(session_id, db, current_user)
  return unwrap_or_raise_http(res)


@router.post("/sessions/{session_id}/iterate", response_model=OptimizationIterationResponse)
async def iterate_optimization_session(
  session_id: str,
  request: OptimizationIterationRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationIterationResponse:
  """
  Submits a natural-language prompt or constraint update to an active optimization session,
  solves the updated JAX/MPAX model, and returns the clinical explanation + DES comparison.

  Args:
      session_id (str): Target optimization session UUID string.
      request (OptimizationIterationRequest): Conversational turn request.
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationIterationResponse: Completed turn with updated MPAX solution and explanation.
  """
  res = await llm_optimization_copilot.iterate_session_result(
    session_id=session_id,
    request=request,
    db=db,
    current_user=current_user,
  )
  return unwrap_or_raise_http(res)


@router.post("/surveys", response_model=OptimizationSurveyResponse)
async def submit_optimization_survey(
  payload: OptimizationSurveyCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationSurveyResponse:
  """
  Submits a qualitative and quantitative UX evaluation survey comparing the self-service
  LLM-MPAX workflow against (A) the manual graduate-student email loop and (B) other hospital tech.

  Args:
      payload (OptimizationSurveyCreate): Survey submission payload.
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationSurveyResponse: Persisted survey record.
  """
  res = await llm_optimization_copilot.submit_survey_result(payload, db, current_user)
  return unwrap_or_raise_http(res)


@router.get("/surveys/summary", response_model=OptimizationEvaluationSummaryResponse)
async def get_optimization_evaluation_summary(
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> OptimizationEvaluationSummaryResponse:
  """
  Returns aggregated quantitative (DES Expert Baseline gap) and qualitative (User Survey)
  evaluation metrics across all hospital optimization sessions.

  Args:
      db (AsyncSession): Active PostgreSQL async session.
      current_user (User): Authenticated hospital user.

  Returns:
      OptimizationEvaluationSummaryResponse: Aggregated quantitative and qualitative metrics.
  """
  _ = current_user
  res = await llm_optimization_copilot.get_evaluation_summary_result(db)
  return unwrap_or_raise_http(res)


__all__ = [
  "create_optimization_session",
  "delete_optimization_session",
  "execute_optimization_quick_action",
  "get_optimization_evaluation_summary",
  "get_optimization_institutions",
  "get_optimization_model_compendium",
  "get_optimization_quick_actions",
  "get_optimization_session",
  "iterate_optimization_session",
  "list_optimization_sessions",
  "router",
  "solve_optimization_stateless",
  "submit_optimization_survey",
]
