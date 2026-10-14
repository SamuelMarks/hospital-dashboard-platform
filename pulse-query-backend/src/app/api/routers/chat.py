"""
Chat API Router.

Handles stateful conversations between the User and the Analytics Assistant.
Integrates with `LLMArenaClient` to provide multiple response candidates for voting.
"""

import json
import logging
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Annotated, cast
from uuid import UUID

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
from app.services.chat_service import (
  build_chat_system_prompt,
  chat_service,
  extract_and_validate_chat_sql,
)
from app.services.llm_client import llm_client
from app.services.schema import schema_service

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
  return extract_and_validate_chat_sql(text)


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
  return await chat_service.generate_assistant_reply(
    db=db,
    conversation_id=conversation_id,
    history_limit=history_limit,
    target_models=target_models,
    arena_client=llm_client,
    schema_svc=schema_service,
    admin_settings_fn=get_admin_settings,
  )


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
  reloaded = result.scalars().first()
  return reloaded if reloaded is not None else conv


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

  return await _generate_assistant_reply(db, conversation_id, target_models=payload.target_models)


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
  return cast(Message, final_result.scalars().first())


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
  system_prompt = build_chat_system_prompt(schema_context)
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
