"""
Service for integrating MPAX solver with the Multi-LLM Arena.
Implements the 5 distinct "What-If" evaluation modes using explicit `AppResult[T]` flows.
"""

import asyncio
import json
import logging
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaRequest,
  MpaxArenaResponse,
)
from app.schemas.simulation import ScenarioResult, ScenarioRunRequest
from app.services.llm_client import ArenaResponse, llm_client
from app.services.runners.sql import run_sql_widget
from app.services.simulation_service import simulation_service
from app.services.sql_utils import extract_sql_from_markdown

logger = logging.getLogger(__name__)


class MpaxArenaService:
  """Orchestrates MPAX and LLMs based on requested evaluation modes."""

  async def persist_arena_run_result(
    self,
    response: MpaxArenaResponse,
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
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
        ground_truth_mpax=response.ground_truth_mpax if isinstance(response.ground_truth_mpax, dict) else None,
      )
      db.add(run_record)
      for cand in response.candidates:
        cand_record = MpaxArenaCandidateRecord(
          id=uuid.UUID(cand.id),
          run_id=run_record.id,
          model_name=cand.model_name,
          content=cand.content,
          sql_snippet=cand.sql_snippet,
          mpax_score=cand.mpax_score,
          mpax_result=cand.mpax_result if isinstance(cand.mpax_result, dict) else None,
          is_winner=cand.is_selected,
        )
        db.add(cand_record)
      await db.commit()
      return Ok(True)
    except Exception as exc:
      logger.warning(f"Failed to persist MPAX Arena run '{response.experiment_id}': {exc}")
      await db.rollback()
      return Err(
        AppError(
          code=ErrorCode.MPAX_PERSISTENCE_ERROR,
          message=f"Failed to persist MPAX Arena run: {exc!s}",
          status_code=500,
        )
      )

  async def run_mpax_arena_result(
    self,
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
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
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Prompt cannot be empty.",
          status_code=400,
        )
      )
    if not request.mode:
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Mode must be specified.",
          status_code=400,
        )
      )

    mode = request.mode
    if mode not in ("judge", "translator", "constraints", "sql_vs_mpax", "critic"):
      return Err(
        AppError(
          code=ErrorCode.MPAX_INVALID_MODE,
          message=f"Unknown mode: {mode}",
          status_code=400,
        )
      )

    try:
      if mode == "judge":
        response = await self._run_judge_mode(request, db, user)
      elif mode == "translator":
        response = await self._run_translator_mode(request, db, user)
      elif mode == "constraints":
        response = await self._run_constraints_mode(request, db, user)
      elif mode == "sql_vs_mpax":
        response = await self._run_sql_vs_mpax_mode(request, db, user)
      else:
        response = await self._run_critic_mode(request, db, user)
    except ValueError as e:
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message=str(e),
          status_code=400,
        )
      )
    except Exception as e:
      return Err(
        AppError(
          code=ErrorCode.INTERNAL_ERROR,
          message=f"MPAX Arena failed: {e!s}",
          status_code=500,
        )
      )

    await self.persist_arena_run_result(response, request, db, user)
    return Ok(response)

  async def run_mpax_arena(
    self,
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> MpaxArenaResponse:
    """
    Entry point for all MPAX Arena integrations.

    Args:
        request (MpaxArenaRequest): Arena evaluation mode and scenario configuration.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user running the arena evaluation.

    Returns:
        MpaxArenaResponse: Evaluated candidate responses and ground-truth MPAX output.

    Raises:
        ValueError: When `request.mode` or `request.prompt` is invalid.
        RuntimeError: When an internal execution error occurs.
    """
    res = await self.run_mpax_arena_result(request, db, user)
    if isinstance(res, Err):
      if res.error.status_code == 400:
        raise ValueError(res.error.message)
      raise RuntimeError(res.error.message)
    return res.value

  async def vote_candidate_result(
    self,
    run_id: str,
    candidate_id: str,
    db: AsyncSession,
    user: User,
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
      parsed_run_id = uuid.UUID(run_id)
      parsed_cand_id = uuid.UUID(candidate_id)
    except ValueError:
      return Err(
        AppError(
          code=ErrorCode.MPAX_RUN_NOT_FOUND,
          message="Invalid UUID format for run or candidate.",
          status_code=404,
        )
      )

    try:
      stmt = select(MpaxArenaRun).where(
        MpaxArenaRun.id == parsed_run_id,
        MpaxArenaRun.user_id == user.id,
      )
      result = await db.execute(stmt)
      run_record = result.scalars().first()
      if not run_record:
        return Err(
          AppError(
            code=ErrorCode.MPAX_RUN_NOT_FOUND,
            message="MPAX Arena run not found.",
            status_code=404,
          )
        )

      found_candidate = False
      for candidate in run_record.candidates:
        if candidate.id == parsed_cand_id:
          candidate.is_winner = True
          found_candidate = True
        else:
          candidate.is_winner = False

      if not found_candidate:
        return Err(
          AppError(
            code=ErrorCode.MPAX_CANDIDATE_NOT_FOUND,
            message="Candidate not found in this MPAX Arena run.",
            status_code=404,
          )
        )

      await db.commit()

      candidates = [
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
          candidates=candidates,
        )
      )
    except Exception as exc:
      return Err(
        AppError(
          code=ErrorCode.INTERNAL_ERROR,
          message=f"MPAX Arena voting failed: {exc!s}",
          status_code=500,
        )
      )

  async def vote_candidate(self, run_id: str, candidate_id: str, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Records a winning vote for a candidate in an MPAX Arena run.

    Args:
        run_id (str): UUID string of the arena run.
        candidate_id (str): UUID string of the candidate to vote for.
        db (AsyncSession): Active database session.
        user (User): Authenticated user casting the vote.

    Returns:
        MpaxArenaResponse: Updated response with `is_selected` reflecting the winning candidate.

    Raises:
        ValueError: If the run or candidate does not exist or is not owned by `user`.
        RuntimeError: If an unexpected persistence error occurs.
    """
    res = await self.vote_candidate_result(run_id, candidate_id, db, user)
    if isinstance(res, Err):
      if res.error.status_code == 404:
        raise ValueError(res.error.message)
      raise RuntimeError(res.error.message)
    return res.value

  def _get_demand_data(self, sql: str) -> list[dict[str, Any]]:
    """
    Utility to fetch demand data from DuckDB via `run_sql_widget`.

    Args:
        sql (str): SQL query string for demand extraction.

    Returns:
        list[dict[str, Any]]: List of row dictionaries returned by the query.
    """
    if not sql:
      return []
    conn = duckdb_manager.get_readonly_connection()
    try:
      cursor = conn.cursor()
      res = run_sql_widget(cursor, {"query": sql})
      return list(res.get("data", []))
    finally:
      conn.close()

  def _normalize_capacity(self, cap: dict[str, Any] | None) -> dict[str, float]:
    """
    Ensures capacity dictionary values are typed as floats.

    Args:
        cap (dict[str, Any] | None): Raw capacity dictionary or None.

    Returns:
        dict[str, float]: Normalized float capacity dictionary.
    """
    base = cap or {"ICU": 10.0, "MedSurg": 50.0}
    return {str(k): float(v) for k, v in base.items()}

  async def _run_judge_mode(
    self,
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> MpaxArenaResponse:
    """
    Mode 1: MPAX solves it, LLMs try to solve it logically.

    Args:
        request (MpaxArenaRequest): Arena evaluation payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user.

    Returns:
        MpaxArenaResponse: Judge mode arena response.
    """
    _ = (db, user)
    demand_data = await asyncio.to_thread(self._get_demand_data, request.demand_sql or "")

    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    sim_res = await simulation_service.run_scenario_async(sim_req)
    if isinstance(sim_res, Err):
      raise ValueError(sim_res.error.message)
    mpax_result = sim_res.value

    nl = chr(10)
    system_prompt = (
      f"You are a hospital capacity planner. Solve this routing problem logically.{nl}"
      f"Demand: {json.dumps(demand_data)}{nl}"
      f"Capacities: {json.dumps(cap)}{nl}"
      "Provide your recommended distribution and reasoning."
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]
    llm_responses = await llm_client.generate_arena_competition(messages)

    return self._build_response(mode="judge", mpax_gt=mpax_result.model_dump(), llm_responses=llm_responses)

  async def _run_translator_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Mode 2: LLMs translate MPAX output into human text.

    Args:
        request (MpaxArenaRequest): Arena evaluation payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user.

    Returns:
        MpaxArenaResponse: Translator mode arena response.
    """
    _ = (db, user)
    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    sim_res = await simulation_service.run_scenario_async(sim_req)
    if isinstance(sim_res, Err):
      raise ValueError(sim_res.error.message)
    mpax_result = sim_res.value

    nl = chr(10)
    system_prompt = (
      "You are a clinical translator. Read the following mathematical optimization output "
      f"from our MPAX solver and translate it into a concise, actionable summary for the shift nurse.{nl}"
      f"MPAX Output: {mpax_result.model_dump_json()}"
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]
    llm_responses = await llm_client.generate_arena_competition(messages)

    return self._build_response(mode="translator", mpax_gt=mpax_result.model_dump(), llm_responses=llm_responses)

  async def _run_constraints_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Mode 3: LLMs generate constraints, run MPAX for each.

    Args:
        request (MpaxArenaRequest): Arena evaluation payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user.

    Returns:
        MpaxArenaResponse: Constraints mode arena response.
    """
    _ = (db, user)
    nl = chr(10)
    system_prompt = (
      "You are a simulation constraint generator. Based on the user's scenario, "
      f'output ONLY a JSON dictionary of unit capacities (e.g. {{"ICU": 5, "MedSurg": 20}}).{nl}'
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      cap_map: dict[str, Any] = {}
      try:
        text = res.content
        start = text.find("{")
        end = text.rfind("}")
        cap_map = json.loads(text[start : end + 1]) if start != -1 and end != -1 else {"ICU": 0}
      except Exception:
        cap_map = {"ICU": 0}

      sim_req = ScenarioRunRequest(
        demand_source_sql=request.demand_sql or "",
        capacity_parameters=self._normalize_capacity(cap_map),
      )
      sim_res = await simulation_service.run_scenario_async(sim_req)
      if isinstance(sim_res, Ok):
        mpax_res = sim_res.value.model_dump()
      else:
        mpax_res = {"status": "error", "message": sim_res.error.message, "assignments": []}

      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          mpax_result=mpax_res,
        )
      )

    return MpaxArenaResponse(experiment_id=experiment_id, mode="constraints", candidates=candidates)

  async def _run_sql_vs_mpax_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Mode 4: LLMs write SQL routing, compared to MPAX.

    Args:
        request (MpaxArenaRequest): Arena evaluation payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user.

    Returns:
        MpaxArenaResponse: SQL vs MPAX mode arena response.
    """
    _ = (db, user)
    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    sim_res = await simulation_service.run_scenario_async(sim_req)
    if isinstance(sim_res, Err):
      raise ValueError(sim_res.error.message)
    mpax_result = sim_res.value

    nl = chr(10)
    system_prompt = (
      "You are a database engineer. Write a DuckDB SQL query to route patients "
      f"based on the following capacities, using CASE WHEN statements.{nl}"
      f"Capacities: {json.dumps(cap)}{nl}"
      f"Base data query: {request.demand_sql}{nl}"
      "Return ONLY valid SQL wrapped in ```sql ```."
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      sql = self._extract_sql(res.content) or ""
      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          sql_snippet=sql if sql else None,
        )
      )

    return MpaxArenaResponse(
      experiment_id=experiment_id,
      mode="sql_vs_mpax",
      ground_truth_mpax=mpax_result.model_dump(),
      candidates=candidates,
    )

  async def _run_critic_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Mode 5: LLM suggests policy, MPAX scores it.

    Args:
        request (MpaxArenaRequest): Arena evaluation payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user.

    Returns:
        MpaxArenaResponse: Critic mode arena response.
    """
    _ = (db, user)
    nl = chr(10)
    system_prompt = (
      "You are a hospital policy maker. Suggest a routing policy, then provide the "
      f"resulting unit capacities as JSON at the very end.{nl}"
      """Example: 'Send them to ICU. {"ICU": 20}'"""
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      cap_map: dict[str, Any] = {}
      try:
        text = res.content
        start = text.rfind("{")
        end = text.rfind("}")
        cap_map = (
          json.loads(text[start : end + 1]) if start != -1 and end != -1 else (request.base_capacity or {"ICU": 10})
        )
      except Exception:
        cap_map = request.base_capacity or {"ICU": 10}

      sim_req = ScenarioRunRequest(
        demand_source_sql=request.demand_sql or "",
        capacity_parameters=self._normalize_capacity(cap_map),
      )
      sim_res = await simulation_service.run_scenario_async(sim_req)
      if isinstance(sim_res, Ok):
        mpax_res = sim_res.value
        score = 100
        overflow = sum(a.Patient_Count for a in mpax_res.assignments if a.Unit == "Overflow")
        score -= int(overflow * 5)
        mpax_score = max(0, score)
      else:
        mpax_res = ScenarioResult(status="error", message=sim_res.error.message, assignments=[])
        mpax_score = 0

      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          mpax_result=mpax_res.model_dump() if hasattr(mpax_res, "model_dump") else mpax_res,
          mpax_score=mpax_score,
        )
      )

    return MpaxArenaResponse(experiment_id=experiment_id, mode="critic", candidates=candidates)

  def _build_response(
    self,
    mode: str,
    mpax_gt: dict[str, Any] | None,
    llm_responses: list[ArenaResponse],
  ) -> MpaxArenaResponse:
    """
    Builds an `MpaxArenaResponse` from ground-truth MPAX output and LLM candidate responses.

    Args:
        mode (str): Evaluation mode identifier.
        mpax_gt (dict[str, Any] | None): Ground-truth MPAX result dictionary.
        llm_responses (list[ArenaResponse]): List of candidate LLM responses.

    Returns:
        MpaxArenaResponse: Constructed arena response.
    """
    candidates = [
      MpaxArenaCandidate(
        id=str(uuid.uuid4()),
        model_name=res.provider_name,
        content=res.content,
        sql_snippet=self._extract_sql(res.content),
      )
      for res in llm_responses
    ]

    experiment_id = str(uuid.uuid4())
    return MpaxArenaResponse(experiment_id=experiment_id, mode=mode, ground_truth_mpax=mpax_gt, candidates=candidates)

  def _extract_sql(self, text: str) -> str | None:
    """
    Extract SQL code from a markdown-formatted string.

    Args:
        text (str): Raw markdown text from an LLM response.

    Returns:
        str | None: Extracted SQL snippet if fenced SQL block exists, else None.
    """
    if "```sql" in text:
      return extract_sql_from_markdown(text)
    return None


mpax_arena_service = MpaxArenaService()
