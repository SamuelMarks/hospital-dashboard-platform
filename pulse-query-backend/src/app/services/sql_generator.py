"""
SQL Generator Service (Arena Orchestrator).

This module orchestrates the Text-to-SQL generation flow.
It acts as the central hub connecting:
1. The Schema Service (Context Provider).
2. The Prompt Engineering Strategies (Context Formatting).
3. The LLM Client (Inference Execution).
4. The Database (Evaluation & Logging).
"""

import asyncio
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.schemas.feedback import ExperimentResponse, FeedbackUpdate
from app.services.admin import get_admin_settings
from app.services.llm_client import ArenaResponse, llm_client
from app.services.prompt_engineering.few_shot_rag import FewShotRAGStrategy
from app.services.prompt_engineering.interfaces import PromptStrategy
from app.services.prompt_engineering.macro_cot import MacroCoTStrategy
from app.services.prompt_engineering.zero_shot import ZeroShotStrategy
from app.services.schema import schema_service
from app.services.sql_utils import (
  extract_sql_from_markdown,
  process_global_filters as interpolate_global_filters,
  sanitize_date_literal,
  sanitize_string_literal,
  sql_fingerprint,
)

logger = logging.getLogger(__name__)


class SQLGeneratorService:
  """
  Service responsible for converting natural language questions into executable SQL
  using a multi-model, multi-strategy approach.
  """

  def __init__(self) -> None:
    """
    Initialize the generator with the Arena client and Schema service.
    """
    self.llm = llm_client
    self.schema_svc = schema_service

  def _get_strategy_implementation(self, strategy_tag: str) -> PromptStrategy:
    """
    Factory method to resolve the strategy string identifier to a concrete class.

    Args:
        strategy_tag (str): The identifier (e.g., "zero-shot", "cot-macro", "rag-few-shot").

    Returns:
        PromptStrategy: The instantiated strategy object.
    """
    tag = strategy_tag.lower() if strategy_tag else "zero-shot"

    if tag == "cot-macro":
      return MacroCoTStrategy()
    if tag == "rag-few-shot":
      return FewShotRAGStrategy()
    return ZeroShotStrategy()

  def _clean_sql_response(self, raw_response: str) -> str:
    """
    Sanitizes LLM output to extract pure SQL.

    Args:
        raw_response (str): The raw text output from the LLM.

    Returns:
        str: The clean SQL query string.
    """
    return extract_sql_from_markdown(raw_response)

  def _sanitize_string_literal(self, value: object) -> str:
    """
    Sanitizes a string literal for safe SQL query injection by escaping single quotes.

    Args:
        value (object): The raw input value.

    Returns:
        str: Escaped string safe for SQL interpolation.
    """
    return sanitize_string_literal(value)

  def _sanitize_date_literal(self, value: object, fallback: str = "") -> str:
    """
    Validates and sanitizes a date or timestamp input against ISO formatting.

    Args:
        value (object): The raw date input value.
        fallback (str): The default value to return if validation fails.

    Returns:
        str: Sanitized date literal string.
    """
    return sanitize_date_literal(value, fallback)

  def process_global_filters(self, sql: str, global_params: dict[str, Any] | None = None) -> str:
    """
    Injects global dashboard filter values into SQL placeholders safely.

    Args:
        sql (str): The SQL template containing `{{handlebars}}`.
        global_params (dict[str, Any] | None): User selection (e.g., `{"dept": "Cardiology"}`).

    Returns:
        str: The executable SQL with values injected.
    """
    return interpolate_global_filters(sql, global_params)

  async def run_arena_experiment(
    self,
    user_query: str,
    db: AsyncSession,
    user: User,
    strategy: str = "zero-shot",
    dry_run: bool = False,
  ) -> ExperimentResponse:
    """
    Orchestrates the Text-to-SQL functionality across the Multi-LLM Arena.

    Args:
        user_query (str): The natural language question.
        db (AsyncSession): Database session for logging.
        user (User): Authenticated user.
        strategy (str): The prompt engineering technique to use.
        dry_run (bool): If True, skips LLM call and returns mock.

    Returns:
        ExperimentResponse: API Model containing candidates.
    """
    strategy_impl = self._get_strategy_implementation(strategy)
    actual_strategy_name = strategy_impl.get_strategy_name()

    schema_context = await asyncio.to_thread(self.schema_svc.get_schema_context_string)
    messages = strategy_impl.build_messages(user_query, schema_context)

    if dry_run:
      logger.info("Dry Run Mode: Skipping LLM Broadcast")
      results = [ArenaResponse("MockModel", "mock/v1", f"SELECT 1; -- {actual_strategy_name}", 10, None)]
    else:
      logger.info(f"Broadcast [{actual_strategy_name}]: '{user_query[:30]}...' to {len(self.llm.swarm)} models.")
      admin_settings = await get_admin_settings(db)
      results = await self.llm.generate_arena_competition(
        messages=messages, temperature=0.1, max_tokens=600, admin_settings=admin_settings
      )

    experiment = ExperimentLog(user_id=user.id, prompt_text=user_query, prompt_strategy=actual_strategy_name)
    db.add(experiment)
    await db.flush()

    for res in results:
      is_success = res.error is None and len(res.content) > 0
      final_sql = self._clean_sql_response(res.content) if is_success else ""
      sql_hash = sql_fingerprint(final_sql) if final_sql else None
      error_msg = res.error if res.error else ("Empty Response" if not is_success else None)

      candidate = ModelCandidate(
        experiment_id=experiment.id,
        model_identifier=res.model_identifier,
        model_tag=res.provider_name,
        generated_sql=final_sql,
        sql_hash=sql_hash,
        latency_ms=res.latency_ms,
        is_selected=False,
        execution_success=None,
        error_message=error_msg,
      )
      db.add(candidate)

    await db.commit()
    await db.refresh(experiment)

    return ExperimentResponse.model_validate(experiment)

  async def run_arena_experiment_result(
    self,
    user_query: str,
    db: AsyncSession,
    user: User,
    strategy: str = "zero-shot",
    dry_run: bool = False,
  ) -> AppResult[ExperimentResponse]:
    """
    Executes an Arena Text-to-SQL experiment and returns an explicit `AppResult[ExperimentResponse]`.

    Args:
        user_query (str): Natural language question.
        db (AsyncSession): Database session for logging.
        user (User): Authenticated user.
        strategy (str): Prompt engineering technique identifier.
        dry_run (bool): If True, skips LLM call and returns mock response.

    Returns:
        AppResult[ExperimentResponse]: `Ok(ExperimentResponse)` or `Err(AppError)`.
    """
    if not user_query or not user_query.strip():
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Prompt cannot be empty.",
          status_code=400,
        )
      )
    try:
      exp = await self.run_arena_experiment(
        user_query=user_query,
        db=db,
        user=user,
        strategy=strategy,
        dry_run=dry_run,
      )
      return Ok(exp)
    except RuntimeError as e:
      return Err(
        AppError(
          code=ErrorCode.LLM_PROVIDER_ERROR,
          message=str(e),
          status_code=503,
        )
      )
    except Exception as e:
      return Err(
        AppError(
          code=ErrorCode.INTERNAL_ERROR,
          message=f"Arena Generation failed: {e!s}",
          status_code=500,
        )
      )

  async def record_feedback_result(
    self,
    experiment_id: UUID,
    candidate_id: UUID,
    payload: FeedbackUpdate,
    db: AsyncSession,
    user: User,
  ) -> AppResult[ExperimentResponse]:
    """
    Records a user vote and optional execution telemetry for an experiment candidate.

    Args:
        experiment_id (UUID): Parent `ExperimentLog` UUID.
        candidate_id (UUID): Target `ModelCandidate` UUID.
        payload (FeedbackUpdate): Selection state and optional execution telemetry.
        db (AsyncSession): Active async database session.
        user (User): Authenticated user who owns the experiment.

    Returns:
        AppResult[ExperimentResponse]: `Ok(ExperimentResponse)` or `Err(AppError)`.
    """
    stmt = (
      select(ExperimentLog)
      .where(ExperimentLog.id == experiment_id, ExperimentLog.user_id == user.id)
      .options(selectinload(ExperimentLog.candidates))
    )
    exp = (await db.execute(stmt)).scalars().first()
    if exp is None:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message=f"Experiment '{experiment_id}' not found.",
          status_code=404,
        )
      )

    target_cand = next((c for c in exp.candidates if c.id == candidate_id), None)
    if target_cand is None:
      return Err(
        AppError(
          code=ErrorCode.CANDIDATE_NOT_FOUND,
          message=f"Candidate '{candidate_id}' not found in experiment '{experiment_id}'.",
          status_code=404,
        )
      )

    for cand in exp.candidates:
      cand.is_selected = (cand.id == candidate_id) if payload.is_selected else False

    if payload.execution_success is not None:
      target_cand.execution_success = payload.execution_success
    if payload.error_message is not None:
      target_cand.error_message = payload.error_message

    await db.commit()
    await db.refresh(exp)
    return Ok(ExperimentResponse.model_validate(exp))


# Singleton instance
sql_generator = SQLGeneratorService()
