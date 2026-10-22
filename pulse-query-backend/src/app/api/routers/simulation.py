"""
Simulation API Router.

Exposes endpoints for the "What-If" Analysis module.
Allows authenticated users to run optimization scenarios without persisting
dashboards or widgets.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.models.user import User
from app.schemas.simulation import ScenarioResult, ScenarioRunRequest
from app.services.simulation_service import simulation_service

router = APIRouter()


@router.post("/run", response_model=ScenarioResult)
async def run_simulation(
  request: ScenarioRunRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> ScenarioResult:
  """
  Executes an optimization scenario.

  This endpoint takes a snapshot of demand (defined by SQL) and applies
  user-defined capacity and constraints to solve the bed allocation problem.

  Args:
      request (ScenarioRunRequest): Configuration containing SQL source and capacity map.
      current_user (User): Authenticated user.

  Returns:
      ScenarioResult: The calculated assignments.
  """
  _ = current_user
  res = await simulation_service.run_scenario_async(request)
  return unwrap_or_raise_http(res)
