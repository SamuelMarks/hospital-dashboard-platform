"""
Strategy implementation for MPAX Arena Mode 2 (`translator`).
"""

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


class TranslatorModeStrategy:
  """Strategy for Mode 2 (`translator`): LLMs translate MPAX optimization output into shift briefings."""

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes `translator` mode: MPAX solves the allocation and LLMs summarize the output for nurses.

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
      "You are a clinical translator. Read the following mathematical optimization output "
      f"from our MPAX solver and translate it into a concise, actionable summary for the shift nurse.{nl}"
      f"MPAX Output: {mpax_result.model_dump_json()}"
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.prompt}]
    llm_responses = await svc_mod.llm_client.generate_arena_competition(messages)

    truth = MpaxSolverTruth(
      status=mpax_result.status,
      assignments=list(mpax_result.assignments),
      message=mpax_result.message,
    )
    return Ok(service._build_response(mode="translator", mpax_gt=truth, llm_responses=llm_responses))
