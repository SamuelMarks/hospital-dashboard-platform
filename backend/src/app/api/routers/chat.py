"""
Chat API Router.

Handles stateful conversations between the User and the Analytics Assistant.
Integrates with `LLMArenaClient` to provide multiple response candidates for voting.
"""

import logging
import re
import asyncio
from datetime import datetime, timezone
from typing import Annotated, List, Optional
from uuid import UUID

import sqlglot
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.config import settings
from app.database.postgres import get_db
from app.models.user import User
from app.models.chat import Conversation, Message, MessageCandidate
from app.schemas.chat import (
  ConversationCreate,
  ConversationUpdate,
  ConversationResponse,
  ConversationDetail,
  MessageCreate,
  MessageResponse,
  MessageVoteRequest,
)
from app.services.schema import schema_service
from app.services.llm_client import llm_client, ArenaResponse

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
  Orchestrates the AI interaction loop with Arena Voting.
  Generates 3 candidates for the user to vote on.

  Args:
      db: Database session.
      conversation_id: Context ID.
      history_limit: Number of past turns to include.

  Returns:
      Message: The persisted assistant response object (parent of candidates).
  """
  # 1. Fetch History
  stmt = (
    select(Message)
    .where(Message.conversation_id == conversation_id)
    .order_by(desc(Message.created_at))
    .limit(history_limit)
  )
  result = await db.execute(stmt)
  history_objs = result.scalars().all()[::-1]

  # 2. Build Messages Payload
  messages_payload = []
  schema_context = schema_service.get_schema_context_string()
  system_prompt = (
    "You are an expert Hospital Analytics Assistant. "
    "Answer questions using DuckDB SQL based on the schema below. "
    "If the user asks for data, output the SQL Query inside a markdown block ```sql ... ```. "
    "Do not execute DML (INSERT/UPDATE). "
    f"\n\nSchema:\n{schema_context}"
  )
  messages_payload.append({"role": "system", "content": system_prompt})

  for msg in history_objs:
    if msg.role in ["user", "assistant"]:
      # Use main content. For voting scenarios, history might need to respect selected candidate content.
      # Assuming msg.content is updated to the winner content after vote.
      messages_payload.append({"role": msg.role, "content": msg.content})

  # 3. Call LLM Arena to get Responsens
  responses: List[ArenaResponse] = []

  try:
    # Attempt 1: Standard Broadcast
    responses = await llm_client.generate_arena_competition(
      messages=messages_payload,
      temperature=0.7,  # Higher temp for variety
      max_tokens=1000,
    )

    # Logic to ensure 3 candidates if we have fewer providers configured
    if len(responses) < 3:
      needed = 3 - len(responses)
      # Generate extras with varying temperature to ensure diversity
      extras = await asyncio.gather(
        *[llm_client.generate_arena_competition(messages_payload, temperature=0.7 + (i * 0.2)) for i in range(needed)]
      )
      for batch in extras:
        responses.extend(batch)

  except Exception as e:
    logger.error(f"LLM Generation Failed: {e}")
    responses = [ArenaResponse("System", "error", "I apologize, but I am unable to process your request.", 0, str(e))]

  # Trim to 3 if more
  responses = responses[:3]

  # 4. Persistence
  now = datetime.now(timezone.utc)

  # Create Parent Message (Placeholder content until vote)
  assistant_msg = Message(
    conversation_id=conversation_id,
    role="assistant",
    content="Multiple options generated. Please select the best response.",
    sql_snippet=None,
    created_at=now,
  )
  db.add(assistant_msg)
  await db.flush()  # Get ID for candidates

  # Create Candidates
  for idx, res in enumerate(responses):
    sql_code = _extract_and_validate_sql(res.content)
    # Use distinct name if multiples from same provider
    tag = res.provider_name if len(responses) <= len(settings.LLM_SWARM) else f"{res.provider_name} {idx + 1}"

    cand = MessageCandidate(
      message_id=assistant_msg.id, model_name=tag, content=res.content, sql_snippet=sql_code, is_selected=False
    )
    db.add(cand)

  # Update parent conversation timestamp
  await db.execute(Conversation.__table__.update().where(Conversation.id == conversation_id).values(updated_at=now))

  await db.commit()

  # Reload to return full structure with candidates
  stmt = select(Message).where(Message.id == assistant_msg.id).options(selectinload(Message.candidates))
  result = await db.execute(stmt)
  return result.scalars().first()


# --- Endpoints ---


@router.get("/", response_model=List[ConversationResponse])
async def list_conversations(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 50,
  offset: int = 0,
) -> List[Conversation]:
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
  now = datetime.now(timezone.utc)
  title = payload.title
  if not title:
    if payload.message:
      title = payload.message[:40].strip() + "..." if len(payload.message) > 40 else payload.message
    else:
      title = "New Chat"

  conv = Conversation(user_id=current_user.id, title=title, created_at=now, updated_at=now)
  db.add(conv)
  await db.flush()

  if payload.message:
    user_msg = Message(conversation_id=conv.id, role="user", content=payload.message, created_at=now)
    db.add(user_msg)
    await db.commit()
    await _generate_assistant_reply(db, conv.id)
  else:
    await db.commit()

  stmt = (
    select(Conversation)
    .where(Conversation.id == conv.id)
    .options(selectinload(Conversation.messages).selectinload(Message.candidates))
  )
  result = await db.execute(stmt)
  return result.scalars().first()


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
  conversation_id: UUID,
  payload: ConversationUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  conv.title = payload.title
  await db.commit()
  await db.refresh(conv)
  return conv


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  await db.delete(conv)
  await db.commit()
  return None


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> List[Message]:
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  msg_result = await db.execute(
    select(Message)
    .where(Message.conversation_id == conversation_id)
    .options(selectinload(Message.candidates))
    .order_by(Message.created_at)
  )
  return msg_result.scalars().all()


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
  conversation_id: UUID,
  payload: MessageCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Message:
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  now = datetime.now(timezone.utc)
  user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content, created_at=now)
  db.add(user_msg)
  conv.updated_at = now
  await db.commit()

  assistant_msg = await _generate_assistant_reply(db, conversation_id)
  return assistant_msg


@router.post("/{conversation_id}/messages/{message_id}/vote", response_model=MessageResponse)
async def vote_candidate(
  conversation_id: UUID,
  message_id: UUID,
  payload: MessageVoteRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Message:
  """
  Selects a specific candidate as the 'winner' for a message.
  Updates the parent Message content/sql_snippet with the winner's data.
  """
  # 1. Verify access
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  if not result.scalars().first():
    raise HTTPException(status_code=404, detail="Conversation not found")

  # 2. Fetch Message
  msg_res = await db.execute(
    select(Message)
    .where(Message.id == message_id, Message.conversation_id == conversation_id)
    .options(selectinload(Message.candidates))
  )
  msg = msg_res.scalars().first()
  if not msg:
    raise HTTPException(status_code=404, detail="Message not found")

  # 3. Find Candidate
  target_candidate = next((c for c in msg.candidates if c.id == payload.candidate_id), None)
  if not target_candidate:
    raise HTTPException(status_code=404, detail="Candidate not found")

  # 4. Apply Vote
  # Reset others
  for c in msg.candidates:
    c.is_selected = c.id == payload.candidate_id

  # Promote Content to Main Message (so history works linearly)
  msg.content = target_candidate.content
  msg.sql_snippet = target_candidate.sql_snippet

  await db.commit()
  await db.refresh(msg)
  return msg
