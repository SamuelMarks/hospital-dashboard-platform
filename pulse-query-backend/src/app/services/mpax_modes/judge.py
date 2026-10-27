"""
Strategy implementation for MPAX Arena Mode 1 (`judge`).
"""

import asyncio
import json
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppResult, Err, Ok
from app.models.user import User
from app.schemas.mpax_arena import (
  MpaxArenaRequest,
  MpaxArenaResponse,
  MpaxSolverTruth,
)
from app.schemas.simulation import ScenarioRunRequest

if TYPE_CHECKING:
  from app.services.mpax_arena_service import MpaxArenaService


class JudgeModeStrategy:
  """Strategy for Mode 1 (`judge`): MPAX solves optimal allocation while LLMs reason logically."""

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes `judge` mode: MPAX solves the allocation and LLMs propose logical routing distributions.

    Args:
        service (MpaxArenaService): Host arena service providing shared helpers.
        request (MpaxArenaRequest): Validated arena request payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user initiating the run.

    Returns:
        AppResult[MpaxArenaResponse]: `Ok(MpaxArenaResponse)` or `Err(AppError)`.
    """
    from app.services import mpax_arena_service as svc_mod

    _ = (db, user)
    demand_data = await asyncio.to_thread(service._get_demand_data, request.demand_sql or "")

    cap = service._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    sim_res = await svc_mod.simulation_service.run_scenario_async(sim_req)
    if isinstance(sim_res, Err):
      return sim_res
    mpax_result = sim_res.value

    nl = chr(10)
    system_prompt = (
      f"You are a hospital capacity planner. Solve this routing problem logically.{nl}"
      f"Demand: {json.dumps(demand_data)}{nl}"
      f"Capacities: {json.dumps(cap)}{nl}"
      "Provide your recommended distribution and reasoning."
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]
    llm_responses = await svc_mod.llm_client.generate_arena_competition(messages)

    truth = MpaxSolverTruth(
      status=mpax_result.status,
      assignments=list(mpax_result.assignments),
      message=mpax_result.message,
    )
    return Ok(service._build_response(mode="judge", mpax_gt=truth, llm_responses=llm_responses))
