"""
Strategy implementation for MPAX Arena Mode 3 (`constraints`).
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


class ConstraintsModeStrategy:
  """Strategy for Mode 3 (`constraints`): LLMs synthesize unit capacity JSON and MPAX evaluates each."""

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes `constraints` mode: LLMs generate unit capacity JSON and MPAX solves each candidate.

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
      "You are a simulation constraint generator. Based on the user's scenario, "
      f'output ONLY a JSON dictionary of unit capacities (e.g. {{"ICU": 5, "MedSurg": 20}}).{nl}'
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]

    llm_responses = await svc_mod.llm_client.generate_arena_competition(messages)

    candidates: list[MpaxArenaCandidate] = []
    experiment_id = str(uuid.uuid4())

    for res in llm_responses:
      parsed_cap = service._parse_constraints_payload_result(res.content, use_last_brace=False)
      cap_map: Mapping[str, float] = parsed_cap.value.capacities if isinstance(parsed_cap, Ok) else {"ICU": 0.0}

      sim_req = ScenarioRunRequest(
        demand_source_sql=request.demand_sql or "",
        capacity_parameters=service._normalize_capacity(cap_map),
      )
      sim_res = await svc_mod.simulation_service.run_scenario_async(sim_req)
      if isinstance(sim_res, Ok):
        mpax_res: MpaxArenaOutcome = MpaxSolverTruth(
          status=sim_res.value.status,
          assignments=list(sim_res.value.assignments),
          message=sim_res.value.message,
        )
      else:
        mpax_res = MpaxSolverErrorPayload(message=sim_res.error.message)

      candidates.append(
        MpaxArenaCandidate(
          id=str(uuid.uuid4()),
          model_name=res.provider_name,
          content=res.content,
          mpax_result=mpax_res,
        )
      )

    return Ok(MpaxArenaResponse(experiment_id=experiment_id, mode="constraints", candidates=candidates))
