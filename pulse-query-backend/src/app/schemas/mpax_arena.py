"""
Schemas for the MPAX vs LLM Arena integrations.
"""

from typing import Literal, TypeAlias

from pydantic import BaseModel

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject, JsonValue
from app.schemas.simulation import SimulationAssignment

MpaxArenaMode = Literal["judge", "translator", "constraints", "sql_vs_mpax", "critic"]
VALID_MPAX_ARENA_MODES: tuple[MpaxArenaMode, ...] = (
  "judge",
  "translator",
  "constraints",
  "sql_vs_mpax",
  "critic",
)


def validate_mpax_arena_mode_result(raw_mode: str) -> AppResult[MpaxArenaMode]:
  """
  Validates a raw mode string into a strongly typed `MpaxArenaMode` literal.

  Args:
      raw_mode (str): Raw mode string from `MpaxArenaRequest`.

  Returns:
      AppResult[MpaxArenaMode]: `Ok(MpaxArenaMode)` if valid, else `Err(AppError)` with 400 status.
  """
  if not raw_mode or not raw_mode.strip():
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Mode must be specified.",
        status_code=400,
      )
    )
  if raw_mode == "judge":
    return Ok("judge")
  if raw_mode == "translator":
    return Ok("translator")
  if raw_mode == "constraints":
    return Ok("constraints")
  if raw_mode == "sql_vs_mpax":
    return Ok("sql_vs_mpax")
  if raw_mode == "critic":
    return Ok("critic")
  return Err(
    AppError(
      code=ErrorCode.MPAX_INVALID_MODE,
      message=f"Unsupported MPAX Arena mode: {raw_mode}",
      status_code=400,
    )
  )


class MpaxAssignmentRow(BaseModel):
  """
  Single patient-flow assignment row produced by the MPAX optimization solver.

  Attributes:
      Service (str): Clinical service name.
      Unit (str): Hospital nursing unit name.
      Patient_Count (float): Optimized number of assigned patients.
  """

  Service: str
  Unit: str
  Patient_Count: float


class MpaxConstraintItem(BaseModel):
  """
  Constraint rule item synthesized or evaluated in the MPAX Arena.

  Attributes:
      type (str): Constraint rule type identifier.
      service (str | None): Optional target clinical service.
      unit (str | None): Optional target hospital unit.
      min (float | None): Optional minimum capacity bound.
      max (float | None): Optional maximum capacity bound.
  """

  type: str
  service: str | None = None
  unit: str | None = None
  min: float | None = None
  max: float | None = None


class MpaxSolverTruth(BaseModel):
  """
  Ground-truth or candidate optimization outcome returned by the MPAX solver.

  Attributes:
      status (str): Solver completion status (`'OPTIMAL'`, `'FEASIBLE'`, `'INFEASIBLE'`, `'ERROR'`, `'success'`).
      objective_value (float | None): Optimal objective value if solved.
      assignments (list[MpaxAssignmentRow | SimulationAssignment]): List of unit-service patient assignments.
      message (str | None): Optional diagnostic or infeasibility explanation.
  """

  status: str
  objective_value: float | None = None
  assignments: list[MpaxAssignmentRow | SimulationAssignment] = []
  message: str | None = None

  def __getitem__(self, key: str) -> JsonValue:
    """Provides mapping-style read access (`outcome['status']`) for serialized compatibility."""
    dumped: JsonObject = self.model_dump(mode="json")
    return dumped[key]


class MpaxSolverErrorPayload(BaseModel):
  """
  Structured error payload when an LLM candidate's constraints fail JSON parsing or solver execution.

  Attributes:
      status (Literal["error"]): Fixed `'error'` status discriminator.
      message (str): Detailed validation or solver failure message.
  """

  status: Literal["error"] = "error"
  message: str

  def __getitem__(self, key: str) -> JsonValue:
    """Provides mapping-style read access (`outcome['status']`) for serialized compatibility."""
    dumped: JsonObject = self.model_dump(mode="json")
    return dumped[key]


MpaxArenaOutcome: TypeAlias = MpaxSolverTruth | MpaxSolverErrorPayload
MpaxPayloadType: TypeAlias = MpaxArenaOutcome | JsonObject


class MpaxArenaRequest(BaseModel):
  """
  Request payload for executing an MPAX vs LLM comparison.
  """

  prompt: str
  mode: str  # Validated in MpaxArenaService against MpaxArenaMode to return 400 AppError
  demand_sql: str | None = (
    "SELECT department as Service, department as Unit, COUNT(*) as Count FROM hospital_data GROUP BY department;"
  )
  base_capacity: dict[str, int] | None = None


class MpaxArenaCandidate(BaseModel):
  """
  Individual LLM candidate result in an MPAX Arena experiment.
  """

  id: str
  model_name: str
  content: str
  is_selected: bool = False
  mpax_result: MpaxPayloadType | None = None
  mpax_score: int | None = None
  sql_snippet: str | None = None


class MpaxArenaResponse(BaseModel):
  """
  Response returned after executing an MPAX Arena scenario.
  """

  experiment_id: str
  mode: str
  ground_truth_mpax: MpaxPayloadType | None = None
  candidates: list[MpaxArenaCandidate]
