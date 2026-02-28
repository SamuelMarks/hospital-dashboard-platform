"""
Service for integrating MPAX solver with the Multi-LLM Arena.
Implements the 5 distinct "What-If" evaluation modes.
"""

import json
import uuid
from typing import Dict, List, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaRequest, MpaxArenaResponse, MpaxArenaCandidate
from app.schemas.simulation import ScenarioRunRequest, ScenarioResult
from app.services.simulation_service import simulation_service
from app.services.llm_client import llm_client
from app.database.duckdb import duckdb_manager


class MpaxArenaService:
  """Orchestrates MPAX and LLMs based on requested evaluation modes."""

  async def run_mpax_arena(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Entry point for all MPAX Arena integrations."""
    mode = request.mode

    if mode == "judge":
      return await self._run_judge_mode(request, db, user)
    elif mode == "translator":
      return await self._run_translator_mode(request, db, user)
    elif mode == "constraints":
      return await self._run_constraints_mode(request, db, user)
    elif mode == "sql_vs_mpax":
      return await self._run_sql_vs_mpax_mode(request, db, user)
    elif mode == "critic":
      return await self._run_critic_mode(request, db, user)
    else:
      raise ValueError(f"Unknown mode: {mode}")

  def _get_demand_data(self, sql: str) -> List[Dict[str, Any]]:
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

  async def _run_judge_mode(self, request: MpaxArenaRequest, db: AsyncSession, user: User) -> MpaxArenaResponse:
    """Mode 1: MPAX solves it, LLMs try to solve it logically."""
    demand_data = self._get_demand_data(request.demand_sql or "")

    # 1. Run MPAX Ground Truth
    cap = request.base_capacity or {"ICU": 10, "MedSurg": 50}
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
    cap = request.base_capacity or {"ICU": 10, "MedSurg": 50}
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
    cap = request.base_capacity or {"ICU": 10, "MedSurg": 50}
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
        sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap_map)
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

  def _build_response(self, mode: str, mpax_gt: Any, llm_responses: List[Any]) -> MpaxArenaResponse:
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

  def _extract_sql(self, text: str) -> Optional[str]:
    if "```sql" in text:
      return text.split("```sql")[1].split("```")[0].strip()
    return None


mpax_arena_service = MpaxArenaService()
