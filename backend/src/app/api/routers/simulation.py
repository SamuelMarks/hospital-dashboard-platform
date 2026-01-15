"""
Simulation API Router.

Exposes endpoints for the "What-If" Analysis module.
Allows authenticated users to run optimization scenarios without persisting
dashboards or widgets.
"""

from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status

from app.api import deps
from app.models.user import User
from app.schemas.simulation import ScenarioRunRequest, ScenarioResult
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
      request: Configuration containing SQL source and capacity map.
      current_user: Authenticated user.

  Returns:
      ScenarioResult: The calculated assignments.
  """
  try:
    result = simulation_service.run_scenario(request)
    return result
  except ValueError as e:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
  except Exception as e:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Simulation Failed: {str(e)}")
