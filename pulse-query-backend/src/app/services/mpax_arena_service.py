"""Service for integrating MPAX solver with the Multi-LLM Arena."""

from collections.abc import Mapping
import json
import logging
import uuid
import duckdb
import httpx
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.json_types import JsonObject, JsonValue, SqlRow
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaMode,
  MpaxArenaOutcome,
  MpaxArenaRequest,
  MpaxArenaResponse,
  validate_mpax_arena_mode_result,
)
from app.services.llm_client import ArenaResponse, llm_client
from app.services.mpax_modes import (
  ConstraintsModeStrategy,
  CriticModeStrategy,
  JudgeModeStrategy,
  MpaxArenaConstraintPayload,
  MpaxArenaModeStrategy,
  SqlVsMpaxModeStrategy,
  TranslatorModeStrategy,
  build_arena_response,
  extract_sql_block,
  get_demand_data,
  normalize_capacity,
  parse_constraints_payload_result,
  serialize_outcome_to_dict,
)
from app.services.simulation_service import simulation_service

logger = logging.getLogger(__name__)
_serialize_outcome_to_dict = serialize_outcome_to_dict


class MpaxArenaService:
  """Orchestrates MPAX and LLMs based on requested evaluation modes using `AppResult[T]`."""

  def __init__(self) -> None:
    """Initializes `MpaxArenaService` with strategy mappings for all 5 arena modes."""
    self._strategies: dict[MpaxArenaMode, MpaxArenaModeStrategy] = {
      "judge": JudgeModeStrategy(),
      "translator": TranslatorModeStrategy(),
      "constraints": ConstraintsModeStrategy(),
      "sql_vs_mpax": SqlVsMpaxModeStrategy(),
      "critic": CriticModeStrategy(),
    }

  def _parse_constraints_payload_result(
    self, text: str, use_last_brace: bool = False
  ) -> AppResult[MpaxArenaConstraintPayload]:
    """
    Extracts and validates a JSON capacity dictionary from an LLM markdown response.

    Args:
        text (str): Raw LLM response text.
        use_last_brace (bool): If True, locates the last `{` block instead of the first.

    Returns:
        AppResult[MpaxArenaConstraintPayload]: `Ok(MpaxArenaConstraintPayload)` or `Err(AppError)`.
    """
    return parse_constraints_payload_result(text, use_last_brace=use_last_brace)

  def _get_demand_data(self, sql: str) -> list[SqlRow]:
    """
    Utility to fetch demand data from DuckDB via `run_sql_widget`.

    Args:
        sql (str): SQL query string for demand extraction.

    Returns:
        list[SqlRow]: List of row dictionaries returned by the query.
    """
    return get_demand_data(sql)

  def _normalize_capacity(
    self, cap: Mapping[str, JsonValue] | Mapping[str, float] | dict[str, int] | None
  ) -> dict[str, float]:
    """
    Ensures capacity dictionary values are typed as floats.

    Args:
        cap (Mapping[str, JsonValue] | Mapping[str, float] | dict[str, int] | None): Raw capacity dictionary or None.

    Returns:
        dict[str, float]: Normalized float capacity dictionary.
    """
    return normalize_capacity(cap)

  def _build_response(
    self, mode: str, mpax_gt: MpaxArenaOutcome | JsonObject | None, llm_responses: list[ArenaResponse]
  ) -> MpaxArenaResponse:
    """
    Builds an `MpaxArenaResponse` from ground-truth MPAX output and LLM candidate responses.

    Args:
        mode (str): Evaluation mode identifier.
        mpax_gt (MpaxArenaOutcome | JsonObject | None): Ground-truth MPAX result.
        llm_responses (list[ArenaResponse]): List of candidate LLM responses.

    Returns:
        MpaxArenaResponse: Constructed arena response.
    """
    return build_arena_response(mode, mpax_gt, llm_responses)

  def _extract_sql(self, text: str) -> str | None:
    """
    Extracts SQL code from a markdown-formatted string.

    Args:
        text (str): Raw markdown text from an LLM response.

    Returns:
        str | None: Extracted SQL snippet if fenced SQL block exists, else None.
    """
    return extract_sql_block(text)

  async def persist_arena_run_result(
    self, response: MpaxArenaResponse, request: MpaxArenaRequest, db: AsyncSession, user: User
  ) -> AppResult[bool]:
    """
    Persists an `MpaxArenaRun` and its `MpaxArenaCandidateRecord` rows to the database.

    Args:
        response (MpaxArenaResponse): Evaluated arena response.
        request (MpaxArenaRequest): Original arena request payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user who initiated the run.

    Returns:
        AppResult[bool]: `Ok(True)` if committed, or `Err(AppError)` with `MPAX_PERSISTENCE_ERROR`.
    """
    try:
      run_record = MpaxArenaRun(
        id=uuid.UUID(response.experiment_id),
        user_id=user.id,
        prompt=request.prompt,
        mode=request.mode,
        ground_truth_mpax=serialize_outcome_to_dict(response.ground_truth_mpax),
      )
      db.add(run_record)
      for cand in response.candidates:
        db.add(
          MpaxArenaCandidateRecord(
            id=uuid.UUID(cand.id),
            run_id=run_record.id,
            model_name=cand.model_name,
            content=cand.content,
            sql_snippet=cand.sql_snippet,
            mpax_score=cand.mpax_score,
            mpax_result=serialize_outcome_to_dict(cand.mpax_result),
            is_winner=cand.is_selected,
          )
        )
      await db.commit()
      return Ok(True)
    except (SQLAlchemyError, ValidationError, ValueError, TypeError, RuntimeError, OSError) as exc:
      logger.warning(f"Failed to persist MPAX Arena run '{response.experiment_id}': {exc}")
      await db.rollback()
      return Err(
        AppError(
          code=ErrorCode.MPAX_PERSISTENCE_ERROR, message=f"Failed to persist MPAX Arena run: {exc!s}", status_code=500
        )
      )

  async def run_mpax_arena_result(
    self, request: MpaxArenaRequest, db: AsyncSession, user: User
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes an MPAX Arena evaluation mode and returns an explicit `AppResult[MpaxArenaResponse]`.

    Args:
        request (MpaxArenaRequest): Arena evaluation mode and scenario configuration.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user running the arena evaluation.

    Returns:
        AppResult[MpaxArenaResponse]: `Ok(MpaxArenaResponse)` on success, or `Err(AppError)`.
    """
    if not request.prompt or not request.prompt.strip():
      return Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Prompt cannot be empty.", status_code=400))
    mode_check = validate_mpax_arena_mode_result(request.mode)
    if isinstance(mode_check, Err):
      return mode_check
    try:
      mode_res = await self._strategies[mode_check.value].execute(self, request, db, user)
    except (
      duckdb.Error,
      SQLAlchemyError,
      httpx.HTTPError,
      ValidationError,
      ValueError,
      TypeError,
      RuntimeError,
      OSError,
    ) as exc:
      return Err(AppError(code=ErrorCode.INTERNAL_ERROR, message=f"MPAX Arena failed: {exc!s}", status_code=500))
    if isinstance(mode_res, Err):
      return mode_res
    await self.persist_arena_run_result(mode_res.value, request, db, user)
    return mode_res

  async def vote_candidate_result(
    self, run_id: str, candidate_id: str, db: AsyncSession, user: User
  ) -> AppResult[MpaxArenaResponse]:
    """
    Records a winning vote for a candidate in an MPAX Arena run owned by `user`.

    Args:
        run_id (str): UUID string of the arena run.
        candidate_id (str): UUID string of the candidate to vote for.
        db (AsyncSession): Active database session.
        user (User): Authenticated user casting the vote.

    Returns:
        AppResult[MpaxArenaResponse]: `Ok(MpaxArenaResponse)` or `Err(AppError)`.
    """
    try:
      parsed_run_id, parsed_cand_id = uuid.UUID(run_id), uuid.UUID(candidate_id)
    except ValueError:
      return Err(
        AppError(code=ErrorCode.MPAX_RUN_NOT_FOUND, message="Invalid UUID format for run or candidate.", status_code=404)
      )
    try:
      stmt = select(MpaxArenaRun).where(MpaxArenaRun.id == parsed_run_id, MpaxArenaRun.user_id == user.id)
      run_record = (await db.execute(stmt)).scalars().first()
      if not run_record:
        return Err(AppError(code=ErrorCode.MPAX_RUN_NOT_FOUND, message="MPAX Arena run not found.", status_code=404))
      found = False
      for candidate in run_record.candidates:
        candidate.is_winner = candidate.id == parsed_cand_id
        found = found or candidate.is_winner
      if not found:
        return Err(
          AppError(
            code=ErrorCode.MPAX_CANDIDATE_NOT_FOUND,
            message="Candidate not found in this MPAX Arena run.",
            status_code=404,
          )
        )
      await db.commit()
      cands = [
        MpaxArenaCandidate(
          id=str(c.id),
          model_name=c.model_name,
          content=c.content,
          is_selected=c.is_winner,
          mpax_score=c.mpax_score,
          mpax_result=c.mpax_result,
          sql_snippet=c.sql_snippet,
        )
        for c in run_record.candidates
      ]
      return Ok(
        MpaxArenaResponse(
          experiment_id=str(run_record.id),
          mode=run_record.mode,
          ground_truth_mpax=run_record.ground_truth_mpax,
          candidates=cands,
        )
      )
    except (SQLAlchemyError, ValidationError, ValueError, TypeError, RuntimeError, OSError) as exc:
      return Err(AppError(code=ErrorCode.INTERNAL_ERROR, message=f"MPAX Arena voting failed: {exc!s}", status_code=500))


mpax_arena_service = MpaxArenaService()
__all__ = [
  "ConstraintsModeStrategy",
  "CriticModeStrategy",
  "JudgeModeStrategy",
  "MpaxArenaConstraintPayload",
  "MpaxArenaModeStrategy",
  "MpaxArenaService",
  "SqlVsMpaxModeStrategy",
  "TranslatorModeStrategy",
  "_serialize_outcome_to_dict",
  "duckdb_manager",
  "json",
  "llm_client",
  "mpax_arena_service",
  "simulation_service",
]
