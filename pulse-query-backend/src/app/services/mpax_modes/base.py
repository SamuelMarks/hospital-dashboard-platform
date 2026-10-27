"""
Shared protocol and utility helpers for MPAX Arena mode strategies.
"""

from collections.abc import Mapping
from typing import TYPE_CHECKING, Protocol, runtime_checkable
import uuid

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.user import User
from app.schemas.json_types import JsonObject, JsonValue, SqlRow
from app.schemas.mpax_arena import (
  MpaxArenaCandidate,
  MpaxArenaOutcome,
  MpaxArenaRequest,
  MpaxArenaResponse,
  MpaxSolverErrorPayload,
  MpaxSolverTruth,
)
from app.services.llm_client import ArenaResponse
from app.services.runners.sql import run_sql_widget
from app.services.sql_utils import extract_sql_from_markdown

if TYPE_CHECKING:
  from app.services.mpax_arena_service import MpaxArenaService


@runtime_checkable
class MpaxArenaModeStrategy(Protocol):
  """
  Strategy protocol for executing one of the 5 MPAX Arena evaluation modes.
  """

  async def execute(
    self,
    service: "MpaxArenaService",
    request: MpaxArenaRequest,
    db: AsyncSession,
    user: User,
  ) -> AppResult[MpaxArenaResponse]:
    """
    Executes the mode-specific arena workflow and returns `AppResult[MpaxArenaResponse]`.

    Args:
        service (MpaxArenaService): Host arena service providing shared helpers.
        request (MpaxArenaRequest): Validated arena request payload.
        db (AsyncSession): Active transactional database session.
        user (User): Authenticated user initiating the run.

    Returns:
        AppResult[MpaxArenaResponse]: `Ok(MpaxArenaResponse)` or `Err(AppError)`.
    """


class MpaxArenaConstraintPayload(BaseModel):
  """
  Validated schema for unit capacity dictionaries synthesized by LLM candidates.

  Attributes:
      capacities (dict[str, float]): Validated mapping of unit names to numeric capacities.
  """

  capacities: dict[str, float] = Field(default_factory=dict)


def serialize_outcome_to_dict(outcome: MpaxArenaOutcome | JsonObject | None) -> JsonObject | None:
  """
  Converts an `MpaxArenaOutcome` or `JsonObject` into a plain `JsonObject` for JSON column persistence.

  Args:
      outcome (MpaxArenaOutcome | JsonObject | None): Typed solver outcome or dictionary.

  Returns:
      JsonObject | None: Plain JSON dictionary or None.
  """
  if outcome is None:
    return None
  if isinstance(outcome, (MpaxSolverTruth, MpaxSolverErrorPayload)):
    dumped: JsonObject = outcome.model_dump(mode="json")
    return dumped
  return outcome


def parse_constraints_payload_result(
  text: str,
  use_last_brace: bool = False,
) -> AppResult[MpaxArenaConstraintPayload]:
  """
  Extracts and validates a JSON capacity dictionary from an LLM markdown response.

  Args:
      text (str): Raw LLM response text.
      use_last_brace (bool): If True, locates the last `{` block instead of the first.

  Returns:
      AppResult[MpaxArenaConstraintPayload]: `Ok(MpaxArenaConstraintPayload)` or `Err(AppError)`.
  """
  start = text.rfind("{") if use_last_brace else text.find("{")
  end = text.rfind("}")
  if start == -1 or end == -1 or start >= end:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="No JSON object braces found in candidate output.",
        status_code=400,
      )
    )
  try:
    from app.services import mpax_arena_service as svc_mod

    raw_obj = svc_mod.json.loads(text[start : end + 1])
    if not isinstance(raw_obj, dict):
      return Err(
        AppError(
          code=ErrorCode.VALIDATION_ERROR,
          message="Parsed JSON payload is not a dictionary.",
          status_code=400,
        )
      )
    validated = MpaxArenaConstraintPayload.model_validate({"capacities": raw_obj})
    return Ok(validated)
  except (ValueError, ValidationError) as exc:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Invalid capacity JSON payload: {exc!s}",
        status_code=400,
      )
    )


def get_demand_data(sql: str) -> list[SqlRow]:
  """
  Utility to fetch demand data from DuckDB via `run_sql_widget`.

  Args:
      sql (str): SQL query string for demand extraction.

  Returns:
      list[SqlRow]: List of row dictionaries returned by the query.
  """
  if not sql:
    return []
  from app.services import mpax_arena_service as svc_mod

  conn = svc_mod.duckdb_manager.get_readonly_connection()
  try:
    cursor = conn.cursor()
    res = run_sql_widget(cursor, {"query": sql})
    return list(res.get("data", []))
  finally:
    conn.close()


def normalize_capacity(
  cap: Mapping[str, JsonValue] | Mapping[str, float] | dict[str, int] | None,
) -> dict[str, float]:
  """
  Ensures capacity dictionary values are typed as floats.

  Args:
      cap (Mapping[str, JsonValue] | Mapping[str, float] | dict[str, int] | None): Raw capacity dictionary or None.

  Returns:
      dict[str, float]: Normalized float capacity dictionary.
  """
  base: Mapping[str, JsonValue] | Mapping[str, float] = cap if cap is not None else {"ICU": 10.0, "MedSurg": 50.0}
  return {
    str(k): float(v) if isinstance(v, (int, float, str)) and not isinstance(v, bool) else 0.0 for k, v in base.items()
  }


def extract_sql_block(text: str) -> str | None:
  """
  Extracts SQL code from a markdown-formatted string.

  Args:
      text (str): Raw markdown text from an LLM response.

  Returns:
      str | None: Extracted SQL snippet if fenced SQL block exists, else None.
  """
  if "```sql" in text:
    return extract_sql_from_markdown(text)
  return None


def build_arena_response(
  mode: str,
  mpax_gt: MpaxArenaOutcome | JsonObject | None,
  llm_responses: list[ArenaResponse],
) -> MpaxArenaResponse:
  """
  Builds an `MpaxArenaResponse` from ground-truth MPAX output and LLM candidate responses.

  Args:
      mode (str): Evaluation mode identifier.
      mpax_gt (MpaxArenaOutcome | JsonObject | None): Ground-truth MPAX result.
      llm_responses (list[ArenaResponse]): List of candidate LLM responses.

  Returns:
      MpaxArenaResponse: Constructed arena response.
  """
  candidates = [
    MpaxArenaCandidate(
      id=str(uuid.uuid4()),
      model_name=res.provider_name,
      content=res.content,
      sql_snippet=extract_sql_block(res.content),
    )
    for res in llm_responses
  ]

  experiment_id = str(uuid.uuid4())
  return MpaxArenaResponse(
    experiment_id=experiment_id,
    mode=mode,
    ground_truth_mpax=mpax_gt,
    candidates=candidates,
  )
