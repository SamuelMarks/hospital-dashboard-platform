"""
Chat API Router.

Handles stateful conversations between the User and the Analytics Assistant.
Integrates with `ChatService` and `LLMArenaClient` to provide multiple response candidates for voting.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.chat import Conversation, Message
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
  chat_service,
  extract_and_validate_chat_sql,
)
from app.services.llm_client import llm_client
from app.services.schema import schema_service

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_and_validate_sql(text: str | None) -> str | None:
  """
  Scans text for Markdown SQL blocks, extracts the first valid one,
  and performs a syntax check using sqlglot.

  Args:
      text (str | None): The raw LLM response.

  Returns:
      str | None: The valid SQL string if found, otherwise None.
  """
  return extract_and_validate_chat_sql(text)


async def _generate_assistant_reply(
  db: AsyncSession,
  conversation_id: UUID,
  history_limit: int = 10,
  target_models: list[str] | None = None,
) -> Message:
  """
  Orchestrates the AI interaction loop with Arena Voting.
  Generates candidates from all configured LLMs for the user to vote on.

  Args:
      db (AsyncSession): Database session.
      conversation_id (UUID): Context ID.
      history_limit (int): Number of past turns to include.
      target_models (list[str] | None): Optional list of model IDs to query.

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


@router.get("/", response_model=list[ConversationResponse])
async def list_conversations(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
  limit: int = 50,
  offset: int = 0,
) -> list[Conversation]:
  """
  Lists recent conversations for the current user.

  Args:
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
      limit (int): Maximum number of conversations to return.
      offset (int): Pagination offset.

  Returns:
      list[Conversation]: Ordered list of conversations.
  """
  return await chat_service.list_conversations(current_user, db, limit=limit, offset=offset)


@router.post("/", response_model=ConversationDetail)
async def create_conversation(
  payload: ConversationCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
  """
  Creates a new conversation and optionally seeds the first message.

  Args:
      payload (ConversationCreate): Conversation creation payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Conversation: Created conversation with messages and candidates.
  """
  return await chat_service.create_conversation(
    payload=payload,
    current_user=current_user,
    db=db,
    reply_fn=_generate_assistant_reply,
  )


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
  conversation_id: UUID,
  payload: ConversationUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
  """
  Updates the title for an existing conversation.

  Args:
      conversation_id (UUID): Target conversation UUID.
      payload (ConversationUpdate): Title update payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Conversation: Updated conversation model.
  """
  res = await chat_service.update_conversation_result(conversation_id, payload, current_user, db)
  return unwrap_or_raise_http(res)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
  """
  Deletes a conversation and its messages.

  Args:
      conversation_id (UUID): Target conversation UUID.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.
  """
  res = await chat_service.delete_conversation_result(conversation_id, current_user, db)
  unwrap_or_raise_http(res)


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(
  conversation_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Message]:
  """
  Returns the ordered message history for a conversation.

  Args:
      conversation_id (UUID): Target conversation UUID.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      list[Message]: Ordered messages with candidates.
  """
  res = await chat_service.get_messages_result(conversation_id, current_user, db)
  return unwrap_or_raise_http(res)


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
  conversation_id: UUID,
  payload: MessageCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> Message:
  """
  Appends a user message and generates assistant candidates.

  Args:
      conversation_id (UUID): Target conversation UUID.
      payload (MessageCreate): User message payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Message: Generated assistant message with candidates.
  """
  res = await chat_service.send_message_result(
    conversation_id=conversation_id,
    payload=payload,
    current_user=current_user,
    db=db,
    reply_fn=_generate_assistant_reply,
  )
  return unwrap_or_raise_http(res)


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

  Args:
      conversation_id (UUID): Target conversation UUID.
      message_id (UUID): Target assistant message UUID.
      payload (MessageVoteRequest): Winning candidate UUID payload.
      current_user (User): Authenticated user.
      db (AsyncSession): Active database session.

  Returns:
      Message: Updated parent assistant message with selected candidate promoted.
  """
  logger.info(f"Voting: conversation={conversation_id}, msg={message_id}, candidate={payload.candidate_id}")
  res = await chat_service.vote_candidate_result(
    conversation_id=conversation_id,
    message_id=message_id,
    payload=payload,
    current_user=current_user,
    db=db,
  )
  return unwrap_or_raise_http(res)


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
      model_id (str | None): Targeted model ID.

  Returns:
      StreamingResponse: Text/event-stream containing incremental tokens.
  """
  ctx_res = await chat_service.prepare_stream_context_result(
    conversation_id=conversation_id,
    current_user=current_user,
    db=db,
    schema_svc=schema_service,
    admin_settings_fn=get_admin_settings,
  )
  messages_payload, admin_settings = unwrap_or_raise_http(ctx_res)

  return StreamingResponse(
    chat_service.stream_conversation_events(
      conversation_id=conversation_id,
      messages_payload=messages_payload,
      admin_settings=admin_settings,
      db=db,
      model_id=model_id,
      arena_client=llm_client,
    ),
    media_type="text/event-stream",
    headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  )
