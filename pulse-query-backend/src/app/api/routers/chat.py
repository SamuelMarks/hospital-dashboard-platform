"""
Chat API Router.

Handles stateful conversations between the User and the Analytics Assistant.
Integrates with `LLMArenaClient` to provide multiple response candidates for voting.
"""

import json
import logging
import re
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timezone
from typing import Annotated, List, Optional
from uuid import UUID

import sqlglot
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.database.postgres import get_db
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.user import User
from app.schemas.chat import (
  ConversationCreate,
  ConversationDetail,
  ConversationResponse,
  ConversationUpdate,
  MessageCreate,
  MessageResponse,
  MessageVoteRequest,
)
from app.services.admin import get_admin_settings
from app.services.llm_client import ArenaResponse, llm_client
from app.services.schema import schema_service
from app.services.sql_utils import sql_fingerprint

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Helper Logic ---


def _extract_and_validate_sql(text: str) -> str | None:
  """
  Scans text for Markdown SQL blocks, extracts the first valid one,
  and performs a syntax check using sqlglot.

  Args:
      text (str): The raw LLM response.

  Returns:
      Optional[str]: The valid SQL string if found, otherwise None.
  """
  if not text:
    return None

  # 1. First priority: look for explicitly tagged ```sql ... ``` blocks
  sql_pattern = r"```sql\s+(.*?)\s*```"
  sql_matches = re.findall(sql_pattern, text, re.DOTALL | re.IGNORECASE)

  for candidate in sql_matches:
    candidate_sql = candidate.strip()
    if candidate_sql:
      try:
        parsed = sqlglot.parse(candidate_sql, read="duckdb")
        if parsed and any(stmt for stmt in parsed if stmt and not isinstance(stmt, sqlglot.exp.Column)):
          return candidate_sql
      except Exception as e:
        logger.warning(f"Explicit SQL block failed validation: {e}")

  # 2. Second priority: look for generic ``` ... ``` blocks that parse as valid SQL statements
  generic_pattern = r"```(?:[a-zA-Z0-9_-]+)?\s+(.*?)\s*```"
  generic_matches = re.findall(generic_pattern, text, re.DOTALL)

  for candidate in generic_matches:
    candidate_sql = candidate.strip()
    if candidate_sql:
      try:
        parsed = sqlglot.parse(candidate_sql, read="duckdb")
        if parsed and any(stmt for stmt in parsed if stmt and not isinstance(stmt, sqlglot.exp.Column)):
          return candidate_sql
      except Exception:
        continue

  return None


async def _generate_assistant_reply(
  db: AsyncSession, conversation_id: UUID, history_limit: int = 10, target_models: list[str] | None = None
) -> Message:
  """
  Orchestrates the AI interaction loop with Arena Voting.
  Generates candidates from all configured LLMs for the user to vote on.

  Args:
      db: Database session.
      conversation_id: Context ID.
      history_limit: Number of past turns to include.
      target_models: Optional list of model IDs to query.

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
    # Use main content. For voting scenarios, history might need to respect selected candidate content.
    # Assuming msg.content is updated to the winner content after vote.
    messages_payload.append({"role": msg.role, "content": msg.content})

  # 3. Call LLM Arena to get Responsens
  responses: list[ArenaResponse] = []
  admin_settings = await get_admin_settings(db)

  try:
    # Broadcast to providers (scoped by target_models if present)
    # Notice: Single-line invocation avoids .coverage mis-reporting lines
    responses = await llm_client.generate_arena_competition(
      messages=messages_payload,
      temperature=0.7,
      max_tokens=1000,
      target_model_ids=target_models,
      admin_settings=admin_settings,
    )

    # Ensure we have at least 3 candidates for voting if possible.
    # If we have fewer candidates than models (e.g. only 1 model configured),
    # we run repeated generations to provide variety via temperature.
    target_count = 3
    # If user explicitly selected fewer than 3 models, don't force expansion
    if target_models and len(target_models) < 3:
      target_count = len(target_models)

    attempts = 0
    max_attempts = 3  # Avoid infinite loops

    # Safety: Only loop if the initial responses were successful.
    # If all providers returned errors (e.g. 404 Model Not Found), trying again won't help.
    any_success = any(r.error is None for r in responses)

    while len(responses) < target_count and attempts < max_attempts and any_success:
      attempts += 1
      # Vary temperature slightly to encourage different solutions
      more = await llm_client.generate_arena_competition(
        messages=messages_payload,
        temperature=0.7 + (attempts * 0.1),
        max_tokens=1000,
        target_model_ids=target_models,
        admin_settings=admin_settings,
      )
      if more:
        responses.extend(more)

    if len(responses) == 0:
      # Fallback mock for safety
      responses = [ArenaResponse("System", "error", "I apologize, no models responded.", 0, "All providers failed")]

  except Exception as e:
    logger.error(f"LLM Generation Failed: {e}")
    responses = [ArenaResponse("System", "error", "I apologize, but I am unable to process your request.", 0, str(e))]

  # 4. Persistence
  now = datetime.now(UTC)

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
  used_names = set()
  for idx, res in enumerate(responses):
    # FIX: Ensure content is never empty string if there was an error
    content_to_save = res.content
    if not content_to_save and res.error:
      content_to_save = f"**Generation Failed**\nError: {res.error}"
    elif not content_to_save:
      content_to_save = "(Empty Response)"

    sql_code = _extract_and_validate_sql(content_to_save)
    sql_hash = sql_fingerprint(sql_code) if sql_code else None

    # Ensure display name uniqueness if provider labels collide (or repeated calls)
    tag = res.provider_name
    if tag in used_names:
      tag = f"{tag} {idx + 1}"
    used_names.add(tag)

    # Schema Fix: Removed 'error_message' as it is not in the MessageCandidate model
    cand = MessageCandidate(
      message_id=assistant_msg.id,
      model_name=tag,
      content=content_to_save,
      sql_snippet=sql_code,
      sql_hash=sql_hash,
      is_selected=False,
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


@router.get("/", response_model=list[ConversationResponse])
async def list_conversations(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 50,
  offset: int = 0,
) -> list[Conversation]:
  """List recent conversations for the current user."""
  stmt = (
    select(Conversation)
    .where(Conversation.user_id == current_user.id)
    .order_by(desc(Conversation.updated_at))
    .offset(offset)
    .limit(limit)
  )
  result = await db.execute(stmt)
  return list(result.scalars().all())


@router.post("/", response_model=ConversationDetail)
async def create_conversation(
  payload: ConversationCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
  """Create a new conversation and optionally seed the first message."""
  now = datetime.now(UTC)
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
    await _generate_assistant_reply(db, conv.id, target_models=payload.target_models)
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
  """Update the title for an existing conversation."""
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
  """Delete a conversation and its messages."""
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  await db.delete(conv)
  await db.commit()


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Message]:
  """Return the ordered message history for a conversation."""
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
  return list(msg_result.scalars().all())


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
  conversation_id: UUID,
  payload: MessageCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Message:
  """Append a user message and generate assistant candidates."""
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  conv = result.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  now = datetime.now(UTC)
  user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content, created_at=now)
  db.add(user_msg)
  conv.updated_at = now
  await db.commit()

  assistant_msg = await _generate_assistant_reply(db, conversation_id, target_models=payload.target_models)
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
  Records a user's vote for a specific generated candidate.

  This selects the chosen candidate by its ID (or matching SQL hash), sets its `is_selected`
  flag to True, and promotes its text and SQL contents to the parent Message object.
  """
  logger.info(f"Voting: conversation={conversation_id}, msg={message_id}, candidate={payload.candidate_id}")
  result = await db.execute(
    select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
  )
  if not result.scalars().first():
    raise HTTPException(status_code=404, detail="Conversation not found")
  stmt_cand = select(MessageCandidate).where(MessageCandidate.id == payload.candidate_id)
  cand_res = await db.execute(stmt_cand)
  target_candidate = cand_res.scalars().first()
  if not target_candidate:
    raise HTTPException(status_code=404, detail="Candidate not found")
  winning_content = target_candidate.content or ""
  winning_sql = target_candidate.sql_snippet or None
  winning_hash = target_candidate.sql_hash
  await db.execute(update(MessageCandidate).where(MessageCandidate.message_id == message_id).values(is_selected=False))
  if winning_hash:
    await db.execute(
      update(MessageCandidate)
      .where(and_(MessageCandidate.message_id == message_id, MessageCandidate.sql_hash == winning_hash))
      .values(is_selected=True)
    )
  else:
    await db.execute(update(MessageCandidate).where(MessageCandidate.id == payload.candidate_id).values(is_selected=True))
  await db.execute(
    update(Message).where(Message.id == message_id).values(content=winning_content, sql_snippet=winning_sql)
  )
  await db.commit()
  db.expire_all()
  final_stmt = select(Message).where(Message.id == message_id).options(selectinload(Message.candidates))
  final_result = await db.execute(final_stmt)
  return final_result.scalars().first()


@router.get("/stream/{conversation_id}")
async def stream_conversation_tokens(
  conversation_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: Annotated[User, Depends(deps.get_current_user)],
  model_id: str | None = None,
) -> StreamingResponse:
  """
  Server-Sent Events (SSE) endpoint streaming real-time LLM token generation.

  Args:
      conversation_id (UUID): The conversation ID context.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user owning the conversation.
      model_id (Optional[str]): Targeted model ID.

  Returns:
      StreamingResponse: Text/event-stream containing incremental tokens.
  """
  stmt = select(Conversation).where(and_(Conversation.id == conversation_id, Conversation.user_id == current_user.id))
  res = await db.execute(stmt)
  conv = res.scalars().first()
  if not conv:
    raise HTTPException(status_code=404, detail="Conversation not found")

  # Fetch history
  hist_stmt = (
    select(Message).where(Message.conversation_id == conversation_id).order_by(desc(Message.created_at)).limit(10)
  )
  hist_res = await db.execute(hist_stmt)
  history = hist_res.scalars().all()[::-1]

  schema_context = schema_service.get_schema_context_string()
  system_prompt = (
    "You are an expert Hospital Analytics Assistant. "
    "Answer questions using DuckDB SQL based on the schema below. "
    "If the user asks for data, output the SQL Query inside a markdown block ```sql ... ```. "
    "Do not execute DML (INSERT/UPDATE). "
    f"\n\nSchema:\n{schema_context}"
  )
  messages_payload = [{"role": "system", "content": system_prompt}]
  for msg in history:
    if msg.role in ["user", "assistant"]:
      messages_payload.append({"role": msg.role, "content": msg.content})

  admin_settings = await get_admin_settings(db)

  async def event_generator() -> AsyncGenerator[str, None]:
    """
    Asynchronous generator yielding Server-Sent Events for real-time LLM token streaming.
    """
    start_payload = json.dumps({"event": "start", "conversation_id": str(conversation_id)})
    yield f"data: {start_payload}\n\n"

    accumulated: list[str] = []
    async for token in llm_client.stream_tokens(
      messages=messages_payload,
      model_id=model_id,
      admin_settings=admin_settings,
    ):
      accumulated.append(token)
      payload = json.dumps({"event": "token", "token": token})
      yield f"data: {payload}\n\n"

    full_text = "".join(accumulated)
    sql = _extract_and_validate_sql(full_text)

    now = datetime.now(UTC)
    assistant_msg = Message(
      conversation_id=conversation_id,
      role="assistant",
      content=full_text,
      sql_snippet=sql,
      created_at=now,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    done_payload = json.dumps(
      {
        "event": "done",
        "message_id": str(assistant_msg.id),
        "content": full_text,
        "sql_snippet": sql,
      }
    )
    yield f"data: {done_payload}\n\n"

  return StreamingResponse(
    event_generator(),
    media_type="text/event-stream",
    headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  )
