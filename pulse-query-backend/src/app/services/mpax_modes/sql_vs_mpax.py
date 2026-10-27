"""
Strategy implementation for MPAX Arena Mode 4 (`sql_vs_mpax`).
"""

import json
from typing import TYPE_CHECKING
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppResult, Err, Ok
from app.models.user import User
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaRequest,
  MpaxArenaResponse,
  MpaxSolverTruth,
)
from app.schemas.simulation import ScenarioRunRequest

if TYPE_CHECKING:
  from app.services.mpax_arena_service import MpaxArenaService


class SqlVsMpaxModeStrategy:
  """Strategy for Mode 4 (`sql_vs_mpax`): LLMs write SQL CASE WHEN routing compared against MPAX LP truth."""

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes `sql_vs_mpax` mode: LLMs write SQL routing queries compared against MPAX ground truth.

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
    cap = service._normalize_capacity(request.base_capacity)
    sim_req = ScenarioRunRequest(demand_source_sql=request.demand_sql or "", capacity_parameters=cap)
    sim_res = await svc_mod.simulation_service.run_scenario_async(sim_req)
    if isinstance(sim_res, Err):
      return sim_res
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

    llm_responses = await svc_mod.llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      sql = service._extract_sql(res.content) or ""
      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          sql_snippet=sql if sql else None,
        )
      )

    truth = MpaxSolverTruth(
      status=mpax_result.status,
      assignments=list(mpax_result.assignments),
      message=mpax_result.message,
    )
    return Ok(
      MpaxArenaResponse(
        experiment_id=experiment_id,
        mode="sql_vs_mpax",
        ground_truth_mpax=truth,
        candidates=candidates,
      )
    )
