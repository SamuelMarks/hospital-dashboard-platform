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
from app.models.user import User
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog, ModelCandidate as ExperimentCandidate
from app.schemas.analytics import LlmOutputAnalyticsRow

router = APIRouter()


@router.get("/llm", response_model=List[LlmOutputAnalyticsRow])
async def list_llm_outputs(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 500,
  offset: int = 0,
) -> List[LlmOutputAnalyticsRow]:
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
  chat_rows: List[LlmOutputAnalyticsRow] = []

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
  ai_rows: List[LlmOutputAnalyticsRow] = []

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
