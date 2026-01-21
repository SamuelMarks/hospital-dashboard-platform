"""
Chat API Router.

Handles stateful conversations between the User and the Analytics Assistant.
Integrates with `any-llm` to providing intelligent SQL generation and
logic validation using `sqlglot`.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Annotated, List, Optional
from uuid import UUID

import sqlglot
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# any_llm integration
from any_llm import completion

from app.api import deps
from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.models.chat import Conversation, Message
from app.schemas.chat import (
  ConversationCreate,
  ConversationResponse,
  ConversationDetail,
  MessageCreate,
  MessageResponse,
)
from app.services.schema import schema_service

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Helper Logic ---


def _extract_and_validate_sql(text: str) -> Optional[str]:
  """
  Scans text for Markdown SQL blocks, extracts the first one,
  and performs a syntax check using sqlglot.

  Args:
      text (str): The raw LLM response.

  Returns:
      Optional[str]: The valid SQL string if found, otherwise None.
  """
  # Regex to find ```sql ... ``` or just ``` ... ``` containing select
  pattern = r"```(?:sql)?(.*?)```"
  match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)

  if not match:
    return None

  candidate_sql = match.group(1).strip()

  if not candidate_sql:
    return None

  try:
    # Validate syntax for DuckDB dialect
    sqlglot.transpile(candidate_sql, read="duckdb")
    return candidate_sql
  except Exception as e:
    logger.warning(f"Generated SQL failed validation: {e}")
    return None


async def _generate_assistant_reply(db: AsyncSession, conversation_id: UUID, history_limit: int = 10) -> Message:
  """
  Orchestrates the AI interaction loop.

  Args:
      db: Database session.
      conversation_id: Context ID.
      history_limit: Number of past turns to include.

  Returns:
      Message: The persisted assistant response object.
  """
  # 1. Fetch History
  # We fetch the latest messages.
  stmt = (
    select(Message)
    .where(Message.conversation_id == conversation_id)
    .order_by(desc(Message.created_at))
    .limit(history_limit)
  )
  result = await db.execute(stmt)
  # Reverse to chronological order (Oldest -> Newest) for LLM Context
  history_objs = result.scalars().all()[::-1]

  # 2. Build Messages Payload
  messages_payload = []

  # System Instructions
  schema_context = schema_service.get_schema_context_string()
  system_prompt = (
    "You are an expert Hospital Analytics Assistant. "
    "Answer questions using DuckDB SQL based on the schema below. "
    "If the user asks for data, output the SQL Query inside a markdown block ```sql ... ```. "
    "Do not execute DML (INSERT/UPDATE). "
    f"\n\nSchema:\n{schema_context}"
  )
  messages_payload.append({"role": "system", "content": system_prompt})

  # History injection
  for msg in history_objs:
    if msg.role in ["user", "assistant"]:
      messages_payload.append({"role": msg.role, "content": msg.content})

  # 3. Call LLM
  # Use default model or environment override
  model_id = "gpt-4o" if settings.LLM_SWARM else "mistral-small"

  try:
    # We wrap in sync bridge if `any_llm` is not natively async,
    # but modern SDKs usually handle this or we run in threadpool.
    # Assuming `completion` handles this or is fast enough for basic usages.
    response = completion(
      model=model_id,
      messages=messages_payload,
      temperature=0.2,  # Low temp for SQL precision
      max_tokens=1000,
    )
    ai_text = response.choices[0].message.content
  except Exception as e:
    logger.error(f"LLM Generation Failed: {e}")
    ai_text = "I apologize, but I am unable to process your request at this moment."

  # 4. Process Content (Extract SQL)
  sql_code = _extract_and_validate_sql(ai_text)

  # 5. Persist Assistant Message
  # Explicitly set timestamp to ensure consistency in tests without DB refresh roundtrips
  now = datetime.now(timezone.utc)

  assistant_msg = Message(
    conversation_id=conversation_id, role="assistant", content=ai_text, sql_snippet=sql_code, created_at=now
  )
  db.add(assistant_msg)

  # Update parent conversation timestamp
  # We must fetch the conversation objects or update via query to avoid detachment issues
  await db.execute(Conversation.__table__.update().where(Conversation.id == conversation_id).values(updated_at=now))

  await db.commit()
  await db.refresh(assistant_msg)

  return assistant_msg


# --- Endpoints ---


@router.get("/", response_model=List[ConversationResponse])
async def list_conversations(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 50,
  offset: int = 0,
) -> List[Conversation]:
  """
  List all conversations for the authenticated user.
  """
  stmt = (
    select(Conversation)
    .where(Conversation.user_id == current_user.id)
    .order_by(desc(Conversation.updated_at))
    .offset(offset)
    .limit(limit)
  )
  result = await db.execute(stmt)
  return result.scalars().all()


@router.post("/", response_model=ConversationDetail)
async def create_conversation(
  payload: ConversationCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
  """
  Start a new conversation.
  """
  now = datetime.now(timezone.utc)

  # 1. Determine Title
  title = payload.title
  if not title:
    if payload.message:
      title = payload.message[:40].strip() + "..." if len(payload.message) > 40 else payload.message
    else:
      title = "New Chat"

  # 2. Create Header
  conv = Conversation(user_id=current_user.id, title=title, created_at=now, updated_at=now)
  db.add(conv)
  await db.flush()  # Generate ID

  # 3. Handle Initial Message
  if payload.message:
    # Save User Message
    user_msg = Message(conversation_id=conv.id, role="user", content=payload.message, created_at=now)
    db.add(user_msg)
    await db.commit()  # Commit so helper can see history

    # Generate Response
    await _generate_assistant_reply(db, conv.id)
  else:
    await db.commit()

  # 4. Return full object
  # Force reload to get messages relation populated
  stmt = select(Conversation).where(Conversation.id == conv.id).options(selectinload(Conversation.messages))
  result = await db.execute(stmt)
  return result.scalars().first()


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> List[Message]:
  """
  Retrieve message history.
  """
  # Verify ownership
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  # Fetch messages chronological
  msg_result = await db.execute(
    select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
  )
  return msg_result.scalars().all()


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
  conversation_id: UUID,
  payload: MessageCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Message:
  """
  Send a new message to an existing conversation.
  """
  # 1. Verify Ownership
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  now = datetime.now(timezone.utc)

  # 2. Save User Message
  user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content, created_at=now)
  db.add(user_msg)

  # Update timestamp manually to avoid dealing with DB-side defaults not returning immediately
  conv.updated_at = now

  await db.commit()

  # 3. Generate AI Response
  assistant_msg = await _generate_assistant_reply(db, conversation_id)

  return assistant_msg
