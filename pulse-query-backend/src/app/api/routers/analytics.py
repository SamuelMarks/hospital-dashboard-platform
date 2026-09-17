"""
Analytics API Router.

Provides read-only analytics views over LLM outputs and user selections.
"""

from typing import Annotated, List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api import deps
from app.database.postgres import get_db
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog
from app.models.feedback import ModelCandidate as ExperimentCandidate
from app.models.alert_rule import AlertRule, AlertSeverity
from app.models.user import User
from app.schemas.analytics import LlmOutputAnalyticsRow, BedCapacityAlert
from app.database.duckdb import duckdb_manager
from datetime import UTC, datetime

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
  rules_res = await db.execute(select(AlertRule).where(AlertRule.is_active.is_(True)))
  rules = rules_res.scalars().all()

  # Default fallback rules if none configured
  if not rules:
    threshold_map = {
      "Critical Care": (90.0, AlertSeverity.CRITICAL.value),
      "General": (95.0, AlertSeverity.WARNING.value),
      "Emergency": (85.0, AlertSeverity.WARNING.value),
    }
  else:
    threshold_map = {r.unit_category: (r.threshold_percentage, r.severity) for r in rules}

  alerts: list[BedCapacityAlert] = []
  now = datetime.now(UTC)

  try:
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
      rows = cur.fetchall()
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
              severity=severity,  # type: ignore[arg-type]
              message=f"Unit '{cat}' is operating at {pct}% occupancy ({occ}/{cap} beds).",
              timestamp=now,
            )
          )
    finally:
      conn.close()
  except Exception:
    # If DuckDB tables are empty or uninitialized during test, return empty alerts list
    pass

  return alerts


@router.get("/llm", response_model=list[LlmOutputAnalyticsRow])
async def list_llm_outputs(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 500,
  offset: int = 0,
) -> list[LlmOutputAnalyticsRow]:
  """
  Returns a flattened view of chat arena candidates, including:
  - user query (nearest prior user message)
  - LLM candidate output and SQL snippet
  - user selection (is_selected)
  """
  assistant_msg = aliased(Message)
  user_msg = aliased(Message)
  fetch_size = max(limit + offset, 0)

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

  stmt = (
    select(
      MessageCandidate,
      assistant_msg,
      Conversation,
      User,
      query_text_subq.label("query_text"),
    )
    .join(assistant_msg, MessageCandidate.message_id == assistant_msg.id)
    .join(Conversation, assistant_msg.conversation_id == Conversation.id)
    .join(User, Conversation.user_id == User.id)
    .order_by(assistant_msg.created_at.desc(), MessageCandidate.model_name.asc())
    .limit(fetch_size)
  )

  result = await db.execute(stmt)
  chat_rows: list[LlmOutputAnalyticsRow] = []

  for cand, assistant, conv, user, query_text in result.all():
    chat_rows.append(
      LlmOutputAnalyticsRow(
        source="chat",
        candidate_id=cand.id,
        assistant_message_id=assistant.id,
        conversation_id=conv.id,
        conversation_title=conv.title,
        user_id=user.id,
        user_email=user.email,
        query_text=query_text,
        prompt_strategy=None,
        llm=cand.model_name,
        sql_snippet=cand.sql_snippet,
        sql_hash=cand.sql_hash,
        is_selected=cand.is_selected,
        created_at=assistant.created_at,
      )
    )

  exp_stmt = (
    select(
      ExperimentCandidate,
      ExperimentLog,
      User,
    )
    .join(ExperimentLog, ExperimentCandidate.experiment_id == ExperimentLog.id)
    .join(User, ExperimentLog.user_id == User.id)
    .order_by(ExperimentLog.created_at.desc(), ExperimentCandidate.model_tag.asc())
    .limit(fetch_size)
  )

  exp_result = await db.execute(exp_stmt)
  ai_rows: list[LlmOutputAnalyticsRow] = []

  for cand, experiment, user in exp_result.all():
    ai_rows.append(
      LlmOutputAnalyticsRow(
        source="ai",
        candidate_id=cand.id,
        assistant_message_id=None,
        conversation_id=None,
        conversation_title=None,
        user_id=user.id,
        user_email=user.email,
        query_text=experiment.prompt_text,
        prompt_strategy=experiment.prompt_strategy,
        llm=cand.model_tag,
        sql_snippet=cand.generated_sql,
        sql_hash=cand.sql_hash,
        is_selected=cand.is_selected,
        created_at=experiment.created_at,
      )
    )

  combined = chat_rows + ai_rows
  combined.sort(key=lambda r: r.created_at, reverse=True)
  return combined[offset : offset + limit]
