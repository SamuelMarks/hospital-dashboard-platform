"""
Analytics Domain Service Module.

Encapsulates real-time hospital bed capacity alert evaluation (joining PostgreSQL
`AlertRule` thresholds with DuckDB census telemetry) and unified multi-source
LLM candidate telemetry (`UNION ALL` across Chat, AI Arena, and Optimization Copilot).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
import logging
from typing import Literal

import duckdb
from sqlalchemy import String, cast, literal, null, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.result import AppResult, Ok
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.models.alert_rule import AlertRule
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog
from app.models.feedback import ModelCandidate as ExperimentCandidate
from app.models.optimization import OptimizationIteration, OptimizationSession
from app.models.user import User
from app.schemas.analytics import BedCapacityAlert, LlmOutputAnalyticsRow

logger = logging.getLogger(__name__)

SeverityLiteral = Literal["INFO", "WARNING", "CRITICAL"]


def _normalize_severity(raw_severity: str) -> SeverityLiteral:
  """
  Normalizes a stored alert rule severity string to a strict `SeverityLiteral`.

  Args:
      raw_severity (str): Stored severity string on `AlertRule`.

  Returns:
      SeverityLiteral: Normalized `'CRITICAL'`, `'INFO'`, or `'WARNING'`.
  """
  upper = str(raw_severity).upper()
  if upper == "CRITICAL":
    return "CRITICAL"
  if upper == "INFO":
    return "INFO"
  return "WARNING"


class AnalyticsService:
  """
  Domain service providing capacity alert evaluations and unified LLM candidate telemetry.
  """

  def _fetch_census_rows_sync(
    self,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection],
  ) -> list[tuple[str, int, int]]:
    """
    Queries DuckDB synchronously for the latest unit census and historic peak capacity.

    Args:
        conn_factory (Callable[[], duckdb.DuckDBPyConnection]): Read-only DuckDB connection factory.

    Returns:
        list[tuple[str, int, int]]: Tuples of `(unit_category, occupied_count, max_capacity)`.
    """
    with duckdb_manager._write_lock:
      conn = conn_factory()
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

  async def get_capacity_alerts_result(
    self,
    db: AsyncSession,
    conn_factory: Callable[[], duckdb.DuckDBPyConnection] | None = None,
  ) -> AppResult[list[BedCapacityAlert]]:
    """
    Evaluates real-time DuckDB hospital census against active `AlertRule` records.

    Args:
        db (AsyncSession): Active PostgreSQL async session.
        conn_factory (Callable[[], duckdb.DuckDBPyConnection] | None): Optional DuckDB connection factory.

    Returns:
        AppResult[list[BedCapacityAlert]]: `Ok(alerts)` containing triggered bed capacity alerts.
    """
    rules_res = await db.execute(select(AlertRule).where(AlertRule.is_active.is_(True)))
    rules = rules_res.scalars().all()

    if not rules:
      threshold_map: dict[str, tuple[float, SeverityLiteral]] = {
        "Critical Care": (90.0, "CRITICAL"),
        "General": (95.0, "WARNING"),
        "Emergency": (85.0, "WARNING"),
      }
    else:
      threshold_map = {r.unit_category: (r.threshold_percentage, _normalize_severity(r.severity)) for r in rules}

    alerts: list[BedCapacityAlert] = []
    now = datetime.now(UTC)
    factory = conn_factory if conn_factory is not None else duckdb_manager.get_readonly_connection

    try:
      rows = await run_in_duckdb_thread(self._fetch_census_rows_sync, factory)
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
    except (duckdb.Error, RuntimeError, ValueError, TypeError, OSError) as exc:
      logger.warning(f"Failed to evaluate capacity alerts against DuckDB: {exc}")

    return Ok(alerts)

  async def list_llm_outputs_result(
    self,
    db: AsyncSession,
    limit: int = 500,
    offset: int = 0,
  ) -> AppResult[list[LlmOutputAnalyticsRow]]:
    """
    Queries a database-paginated (`UNION ALL`) view of chat, AI, and MPAX Arena candidates.

    Args:
        db (AsyncSession): Active transactional database session.
        limit (int): Maximum number of combined rows to return.
        offset (int): Number of rows to skip before returning results.

    Returns:
        AppResult[list[LlmOutputAnalyticsRow]]: `Ok(rows)` ordered chronologically.
    """
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

    opt_stmt = (
      select(
        literal("optimization").label("source"),
        OptimizationIteration.id.label("candidate_id"),
        cast(null(), Message.id.type).label("assistant_message_id"),
        OptimizationSession.id.label("conversation_id"),
        OptimizationSession.title.label("conversation_title"),
        User.id.label("user_id"),
        User.email.label("user_email"),
        OptimizationIteration.user_prompt.label("query_text"),
        OptimizationSession.use_case.label("prompt_strategy"),
        OptimizationIteration.model_id.label("llm"),
        OptimizationIteration.assistant_explanation.label("sql_snippet"),
        cast(null(), String).label("sql_hash"),
        literal(True).label("is_selected"),
        OptimizationIteration.created_at.label("created_at"),
      )
      .join(OptimizationSession, OptimizationIteration.session_id == OptimizationSession.id)
      .join(User, OptimizationSession.user_id == User.id)
    )

    combined_subq = union_all(chat_stmt, ai_stmt, opt_stmt).subquery()
    final_stmt = (
      select(combined_subq)
      .order_by(combined_subq.c.created_at.desc(), combined_subq.c.llm.asc())
      .limit(max(limit, 0))
      .offset(max(offset, 0))
    )

    result = await db.execute(final_stmt)
    rows = [
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
    return Ok(rows)


analytics_service = AnalyticsService()
