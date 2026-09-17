"""
Service for integrating MPAX solver with the Multi-LLM Arena.
Implements the 5 distinct "What-If" evaluation modes.
"""

import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.duckdb import duckdb_manager
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaRequest,
  MpaxArenaResponse,
)
from app.schemas.simulation import ScenarioResult, ScenarioRunRequest
from app.services.llm_client import llm_client
from app.services.simulation_service import simulation_service


class MpaxArenaService:
  """Orchestrates MPAX and LLMs based on requested evaluation modes."""

  async def run_mpax_arena(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Entry point for all MPAX Arena integrations."""
    mode = request.mode

    if mode == "judge":
      response = await self._run_judge_mode(request, db, user)
    elif mode == "translator":
      response = await self._run_translator_mode(request, db, user)
    elif mode == "constraints":
      response = await self._run_constraints_mode(request, db, user)
    elif mode == "sql_vs_mpax":
      response = await self._run_sql_vs_mpax_mode(request, db, user)
    elif mode == "critic":
      response = await self._run_critic_mode(request, db, user)
    else:
      raise ValueError(f"Unknown mode: {mode}")

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
    except Exception:
      await db.rollback()

    return response

  async def vote_candidate(self, run_id: str, candidate_id: str, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """
    Records a winning vote for a candidate in an MPAX Arena run.

    Args:
        run_id (str): UUID string of the arena run.
        candidate_id (str): UUID string of the candidate to vote for.
        db (AsyncSession): Active database session.
        user (User): Authenticated user casting the vote.

    Returns:
        MpaxArenaResponse: Updated response with is_selected reflecting the winning candidate.

    Raises:
        ValueError: If the run or candidate does not exist.
    """
    try:
      parsed_run_id = uuid.UUID(run_id)
      parsed_cand_id = uuid.UUID(candidate_id)
    except ValueError as err:
      raise ValueError("Invalid UUID format for run or candidate.") from err

    stmt = select(MpaxArenaRun).where(MpaxArenaRun.id == parsed_run_id)
    result = await db.execute(stmt)
    run_record = result.scalars().first()
    if not run_record:
      raise ValueError("MPAX Arena run not found.")

    found_candidate = False
    for candidate in run_record.candidates:
      if candidate.id == parsed_cand_id:
        candidate.is_winner = True
        found_candidate = True
      else:
        candidate.is_winner = False

    if not found_candidate:
      raise ValueError("Candidate not found in this MPAX Arena run.")

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

    return MpaxArenaResponse(
      experiment_id=str(run_record.id),
      mode=run_record.mode,
      ground_truth_mpax=run_record.ground_truth_mpax,
      candidates=candidates,
    )

  def _get_demand_data(self, sql: str) -> list[dict[str, Any]]:
    """Utility to fetch demand data directly from DuckDB."""
    if not sql:
      return []
    conn = duckdb_manager.get_readonly_connection()
    try:
      cursor = conn.cursor()
      cursor.execute(sql)
      columns = [desc[0] for desc in cursor.description]
      rows = cursor.fetchall()
      return [dict(zip(columns, row)) for row in rows]
    finally:
      conn.close()

  def _normalize_capacity(self, cap: dict[str, Any] | None) -> dict[str, float]:
    """Ensures capacity dictionary values are typed as floats."""
    base = cap or {"ICU": 10.0, "MedSurg": 50.0}
    return {str(k): float(v) for k, v in base.items()}

  async def _run_judge_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 1: MPAX solves it, LLMs try to solve it logically."""
    demand_data = self._get_demand_data(request.demand_sql or "")

    # 1. Run MPAX Ground Truth
    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    mpax_result = simulation_service.run_scenario(sim_req)

    # 2. Prompt LLMs
    system_prompt = (
      "You are a hospital capacity planner. Solve this routing problem logically.\n"
      f"Demand: {json.dumps(demand_data)}\n"
      f"Capacities: {json.dumps(cap)}\n"
      "Provide your recommended distribution and reasoning."
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    return self._build_response(mode="judge", mpax_gt=mpax_result.model_dump(), llm_responses=llm_responses)

  async def _run_translator_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 2: LLMs translate MPAX output into human text."""
    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    mpax_result = simulation_service.run_scenario(sim_req)

    system_prompt = (
      "You are a clinical translator. Read the following mathematical optimization output "
      "from our MPAX solver and translate it into a concise, actionable summary for the shift nurse.\n"
      f"MPAX Output: {mpax_result.model_dump_json()}"
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    return self._build_response(mode="translator", mpax_gt=mpax_result.model_dump(), llm_responses=llm_responses)

  async def _run_constraints_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 3: LLMs generate constraints, run MPAX for each."""
    system_prompt = (
      "You are a simulation constraint generator. Based on the user's scenario, "
      'output ONLY a JSON dictionary of unit capacities (e.g. {"ICU": 5, "MedSurg": 20}).\n'
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      cap_map = {}
      try:
        # Naive json extraction
        text = res.content
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
          cap_map = json.loads(text[start : end + 1])
        else:
          cap_map = {"ICU": 0}  # fallback
      except:
        cap_map = {"ICU": 0}

      try:
        sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap_map)
        mpax_res = simulation_service.run_scenario(sim_req).model_dump()
      except Exception as e:
        mpax_res = {"status": "error", "message": str(e), "assignments": []}

      candidates.append(
        MpaxArenaCandidate(id=str(uuid.uuid4()), model_name=res.provider_name, content=res.content, mpax_result=mpax_res)
      )

    return MpaxArenaResponse(experiment_id=experiment_id, mode="constraints", candidates=candidates)

  async def _run_sql_vs_mpax_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 4: LLMs write SQL routing, compared to MPAX."""
    cap = self._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    mpax_result = simulation_service.run_scenario(sim_req)

    system_prompt = (
      "You are a database engineer. Write a DuckDB SQL query to route patients "
      "based on the following capacities, using CASE WHEN statements.\n"
      f"Capacities: {json.dumps(cap)}\n"
      f"Base data query: {request.demand_sql}\n"
      "Return ONLY valid SQL wrapped in ```sql ```."
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      sql = ""
      if "```sql" in res.content:
        sql = res.content.split("```sql")[1].split("```")[0].strip()

      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()), model_name=res.provider_name, content=res.content, sql_snippet=sql if sql else None
        )
      )

    return MpaxArenaResponse(
      experiment_id=experiment_id, mode="sql_vs_mpax", ground_truth_mpax=mpax_result.model_dump(), candidates=candidates
    )

  async def _run_critic_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 5: LLM suggests policy, MPAX scores it."""
    system_prompt = (
      "You are a hospital policy maker. Suggest a routing policy, then provide the "
      "resulting unit capacities as JSON at the very end.\n"
      "Example: 'Send them to ICU. {\"ICU\": 20}'"
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await llm_client.generate_arena_competition(messages)

    candidates = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      cap_map = {}
      try:
        text = res.content
        start = text.rfind("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
          cap_map = json.loads(text[start : end + 1])
        else:
          cap_map = request.base_capacity or {"ICU": 10}
      except:
        cap_map = request.base_capacity or {"ICU": 10}

      try:
        sim_req = ScenarioRunRequest(
          demand_source_sql=request.demand_sql or "", capacity_parameters=self._normalize_capacity(cap_map)
        )
        mpax_res = simulation_service.run_scenario(sim_req)

        # Calculate simple score: negative overflow
        score = 100
        overflow = sum(a.Patient_Count for a in mpax_res.assignments if a.Unit == "Overflow")
        score -= int(overflow * 5)  # arbitrarily penalize 5 points per overflow
        mpax_score = max(0, score)

      except Exception as e:
        mpax_res = ScenarioResult(status="error", message=str(e), assignments=[])
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

  def _build_response(self, mode: str, mpax_gt: Any, llm_responses: list[Any]) -> MpaxArenaResponse:
    """Helper to build response and save experiment."""
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
    """Extract SQL code from a markdown-formatted string."""
    if "```sql" in text:
      return text.split("```sql")[1].split("```")[0].strip()
    return None


mpax_arena_service = MpaxArenaService()
