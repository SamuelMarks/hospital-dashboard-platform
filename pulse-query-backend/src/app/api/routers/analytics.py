"""
Analytics API Router.

Provides read-only analytics views over LLM outputs and user selections.
"""

import asyncio
from datetime import UTC, datetime
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import String, cast, literal, null, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api import deps
from app.database.duckdb import duckdb_manager
from app.database.postgres import get_db
from app.models.alert_rule import AlertRule
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog
from app.models.feedback import ModelCandidate as ExperimentCandidate
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.analytics import BedCapacityAlert, LlmOutputAnalyticsRow

logger = logging.getLogger(__name__)
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
  rules_res = await db.execute(select(AlertRule).where(AlertRule.is_active.is_(True)))
  rules = rules_res.scalars().all()

  if not rules:
    threshold_map: dict[str, tuple[float, Literal["INFO", "WARNING", "CRITICAL"]]] = {
      "Critical Care": (90.0, "CRITICAL"),
      "General": (95.0, "WARNING"),
      "Emergency": (85.0, "WARNING"),
    }
  else:
    threshold_map = {
      r.unit_category: (
        r.threshold_percentage,
        "CRITICAL" if r.severity == "CRITICAL" else ("INFO" if r.severity == "INFO" else "WARNING"),
      )
      for r in rules
    }

  alerts: list[BedCapacityAlert] = []
  now = datetime.now(UTC)

  def _fetch_census_rows() -> list[tuple[str, int, int]]:
    """
    Queries DuckDB for the latest unit census and historic capacity in a worker thread.

    Returns:
        list[tuple[str, int, int]]: Tuples of `(unit_category, occupied_count, max_capacity)`.
    """
    conn = duckdb_manager.get_readonly_connection()
    try:
      cur = conn.cursor()
      query = """
        WITH latest_census AS (
            SELECT COALESCE(Unit_Category, 'General') AS unit_cat, COUNT(*) AS occupied
            FROM synthetic_hospital_data
            WHERE Midnight_Census_DateTime = (SELECT MAX(Midnight_Census_DateTime) FROM synthetic_hospital_data)
            GROUP BY 1
        ),
        historic_capacity AS (
            SELECT COALESCE(Unit_Category, 'General') AS unit_cat, MAX(daily_census) AS capacity
            FROM (
                SELECT Unit_Category, CAST(Midnight_Census_DateTime AS DATE), COUNT(*) AS daily_census
                FROM synthetic_hospital_data
                GROUP BY 1, 2
            )
            GROUP BY 1
        )
        SELECT
            l.unit_cat,
            l.occupied,
            GREATEST(COALESCE(h.capacity, l.occupied), l.occupied) AS capacity
        FROM latest_census l
        LEFT JOIN historic_capacity h ON l.unit_cat = h.unit_cat;
      """
      cur.execute(query)
      return list(cur.fetchall())
    finally:
      conn.close()

  try:
    rows = await asyncio.to_thread(_fetch_census_rows)
    for cat, occupied, capacity in rows:
      cap = max(int(capacity), 1)
      occ = int(occupied)
      pct = round((occ / cap) * 100.0, 1)

      threshold, severity = threshold_map.get(cat, (90.0, "WARNING"))
      if pct >= threshold:
        alerts.append(
          BedCapacityAlert(
            unit_category=cat,
            current_census=occ,
            max_capacity=cap,
            occupancy_percentage=pct,
            threshold_percentage=threshold,
            severity=severity,
            message=f"Unit '{cat}' is operating at {pct}% occupancy ({occ}/{cap} beds).",
            timestamp=now,
          )
        )
  except Exception as exc:
    logger.warning(f"Failed to evaluate capacity alerts against DuckDB: {exc}")

  return alerts


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
  assistant_msg = aliased(Message)
  user_msg = aliased(Message)

  query_text_subq = (
    select(user_msg.content)
    .where(
      user_msg.conversation_id == assistant_msg.conversation_id,
      user_msg.role == "user",
      user_msg.created_at < assistant_msg.created_at,
    )
    .order_by(user_msg.created_at.desc())
    .limit(1)
    .correlate(assistant_msg)
    .scalar_subquery()
  )

  chat_stmt = (
    select(
      literal("chat").label("source"),
      MessageCandidate.id.label("candidate_id"),
      assistant_msg.id.label("assistant_message_id"),
      Conversation.id.label("conversation_id"),
      Conversation.title.label("conversation_title"),
      User.id.label("user_id"),
      User.email.label("user_email"),
      query_text_subq.label("query_text"),
      cast(null(), String).label("prompt_strategy"),
      MessageCandidate.model_name.label("llm"),
      MessageCandidate.sql_snippet.label("sql_snippet"),
      MessageCandidate.sql_hash.label("sql_hash"),
      MessageCandidate.is_selected.label("is_selected"),
      assistant_msg.created_at.label("created_at"),
    )
    .join(assistant_msg, MessageCandidate.message_id == assistant_msg.id)
    .join(Conversation, assistant_msg.conversation_id == Conversation.id)
    .join(User, Conversation.user_id == User.id)
  )

  ai_stmt = (
    select(
      literal("ai").label("source"),
      ExperimentCandidate.id.label("candidate_id"),
      cast(null(), Message.id.type).label("assistant_message_id"),
      cast(null(), Conversation.id.type).label("conversation_id"),
      cast(null(), String).label("conversation_title"),
      User.id.label("user_id"),
      User.email.label("user_email"),
      ExperimentLog.prompt_text.label("query_text"),
      ExperimentLog.prompt_strategy.label("prompt_strategy"),
      ExperimentCandidate.model_tag.label("llm"),
      ExperimentCandidate.generated_sql.label("sql_snippet"),
      ExperimentCandidate.sql_hash.label("sql_hash"),
      ExperimentCandidate.is_selected.label("is_selected"),
      ExperimentLog.created_at.label("created_at"),
    )
    .join(ExperimentLog, ExperimentCandidate.experiment_id == ExperimentLog.id)
    .join(User, ExperimentLog.user_id == User.id)
  )

  mpax_stmt = (
    select(
      literal("mpax_arena").label("source"),
      MpaxArenaCandidateRecord.id.label("candidate_id"),
      cast(null(), Message.id.type).label("assistant_message_id"),
      cast(null(), Conversation.id.type).label("conversation_id"),
      cast(null(), String).label("conversation_title"),
      User.id.label("user_id"),
      User.email.label("user_email"),
      MpaxArenaRun.prompt.label("query_text"),
      MpaxArenaRun.mode.label("prompt_strategy"),
      MpaxArenaCandidateRecord.model_name.label("llm"),
      MpaxArenaCandidateRecord.sql_snippet.label("sql_snippet"),
      cast(null(), String).label("sql_hash"),
      MpaxArenaCandidateRecord.is_winner.label("is_selected"),
      MpaxArenaRun.created_at.label("created_at"),
    )
    .join(MpaxArenaRun, MpaxArenaCandidateRecord.run_id == MpaxArenaRun.id)
    .join(User, MpaxArenaRun.user_id == User.id)
  )

  combined_subq = union_all(chat_stmt, ai_stmt, mpax_stmt).subquery()
  final_stmt = (
    select(combined_subq)
    .order_by(combined_subq.c.created_at.desc(), combined_subq.c.llm.asc())
    .limit(max(limit, 0))
    .offset(max(offset, 0))
  )

  result = await db.execute(final_stmt)
  return [
    LlmOutputAnalyticsRow(
      source=row.source,
      candidate_id=row.candidate_id,
      assistant_message_id=row.assistant_message_id,
      conversation_id=row.conversation_id,
      conversation_title=row.conversation_title,
      user_id=row.user_id,
      user_email=row.user_email,
      query_text=row.query_text,
      prompt_strategy=row.prompt_strategy,
      llm=row.llm,
      sql_snippet=row.sql_snippet,
      sql_hash=row.sql_hash,
      is_selected=row.is_selected,
      created_at=row.created_at,
    )
    for row in result.all()
  ]
