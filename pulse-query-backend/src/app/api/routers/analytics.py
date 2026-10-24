"""
Analytics API Router.

Provides read-only analytics views over LLM outputs and user selections
by delegating to `AnalyticsService`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.analytics import BedCapacityAlert, LlmOutputAnalyticsRow
from app.services.analytics_service import analytics_service

router = APIRouter()


@router.get("/alerts", response_model=list[BedCapacityAlert])
async def get_capacity_alerts(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BedCapacityAlert]:
  """
  Evaluates real-time DuckDB hospital census against configured AlertRules.

  Args:
      current_user (User): Authenticated user requesting alerts.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      list[BedCapacityAlert]: List of active capacity alerts exceeding configured thresholds.
  """
  _ = current_user
  res = await analytics_service.get_capacity_alerts_result(
    db=db,
    conn_factory=duckdb_manager.get_readonly_connection,
  )
  return unwrap_or_raise_http(res)


@router.get("/llm", response_model=list[LlmOutputAnalyticsRow])
async def list_llm_outputs(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 500,
  offset: int = 0,
) -> list[LlmOutputAnalyticsRow]:
  """
  Returns a flattened, database-paginated (`UNION ALL`) view of chat, AI, and MPAX Arena candidates.

  Args:
      current_user (User): Authenticated user requesting LLM telemetry.
      db (AsyncSession): Active transactional database session.
      limit (int): Maximum number of combined rows to return.
      offset (int): Number of rows to skip before returning results.

  Returns:
      list[LlmOutputAnalyticsRow]: Combined and chronologically sorted LLM candidate telemetry rows.
  """
  _ = current_user
  res = await analytics_service.list_llm_outputs_result(db=db, limit=limit, offset=offset)
  return unwrap_or_raise_http(res)
