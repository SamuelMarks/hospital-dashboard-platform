"""
Strategy implementation for MPAX Arena Mode 5 (`critic`).
"""

from collections.abc import Mapping
from typing import TYPE_CHECKING
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppResult, Ok
from app.models.user import User
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaOutcome,
  MpaxArenaRequest,
  MpaxArenaResponse,
  MpaxSolverErrorPayload,
  MpaxSolverTruth,
)
from app.schemas.simulation import ScenarioRunRequest

if TYPE_CHECKING:
  from app.services.mpax_arena_service import MpaxArenaService


class CriticModeStrategy:
  """Strategy for Mode 5 (`critic`): LLMs propose policy + capacities and MPAX scores overflow penalty."""

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes `critic` mode: LLMs propose policy and unit capacities scored by MPAX overflow penalty.

    Args:
        service (MpaxArenaService): Host arena service providing shared helpers.
        request (MpaxArenaRequest): Validated arena request payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user initiating the run.

    Returns:
        AppResult[MpaxArenaResponse]: `Ok(MpaxArenaResponse)`.
    """
    from app.services import mpax_arena_service as svc_mod

    _ = (db, user)
    nl = chr(10)
    system_prompt = (
      "You are a hospital policy maker. Suggest a routing policy, then provide the "
      f"resulting unit capacities as JSON at the very end.{nl}"
      """Example: 'Send them to ICU. {"ICU": 20}'"""
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await svc_mod.llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())
    fallback_cap: dict[str, float] = (
      {str(k): float(v) for k, v in request.base_capacity.items()} if request.base_capacity is not None else {"ICU": 10.0}
    )

    for res in llm_responses:
      parsed_cap = service._parse_constraints_payload_result(res.content, use_last_brace=True)
      cap_map: Mapping[str, float] = parsed_cap.value.capacities if isinstance(parsed_cap, Ok) else fallback_cap

      sim_req = ScenarioRunRequest(
        demand_source_sql=request.demand_sql or "",
        capacity_parameters=service._normalize_capacity(cap_map),
      )
      sim_res = await svc_mod.simulation_service.run_scenario_async(sim_req)
      if isinstance(sim_res, Ok):
        mpax_outcome: MpaxArenaOutcome = MpaxSolverTruth(
          status=sim_res.value.status,
          assignments=list(sim_res.value.assignments),
          message=sim_res.value.message,
        )
        score = 100
        overflow = sum(a.Patient_Count for a in sim_res.value.assignments if a.Unit == "Overflow")
        score -= int(overflow * 5)
        mpax_score = max(0, score)
      else:
        mpax_outcome = MpaxSolverErrorPayload(message=sim_res.error.message)
        mpax_score = 0

      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          mpax_result=mpax_outcome,
          mpax_score=mpax_score,
        )
      )

    return Ok(MpaxArenaResponse(experiment_id=experiment_id, mode="critic", candidates=candidates))
