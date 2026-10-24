"""
Chat Domain Service Module.

Encapsulates SQL extraction/validation from Markdown chat responses,
system prompt assembly using `SchemaService`, conversation/message persistence,
candidate voting, and multi-LLM Arena candidate generation for conversational analytics.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import UTC, datetime
import json
import logging
import re
from uuid import UUID

from sqlalchemy import and_, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import sqlglot

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse
from app.schemas.chat import ConversationCreate, ConversationUpdate, MessageCreate, MessageVoteRequest
from app.services.admin import get_admin_settings
from app.services.llm_client import ArenaResponse, LLMArenaClient, llm_client
from app.services.schema import SchemaService, schema_service
from app.services.sql_utils import sql_fingerprint

logger = logging.getLogger(__name__)

AdminSettingsFn = Callable[[AsyncSession], Awaitable[AdminSettingsResponse]]


def _is_valid_sql_block(candidate_sql: str) -> bool:
  """
  Checks whether a candidate SQL string parses as a valid non-column DuckDB statement.

  Args:
      candidate_sql (str): Candidate SQL text to validate.

  Returns:
      bool: True if valid DuckDB SQL statement, False otherwise.
  """
  parsed = sqlglot.parse(candidate_sql, read="duckdb")
  return bool(parsed and any(stmt for stmt in parsed if stmt and not isinstance(stmt, sqlglot.exp.Column)))


def extract_and_validate_chat_sql(text: str | None) -> str | None:
  """
  Scans text for Markdown SQL blocks, extracts the first valid statement,
  and performs a syntax check using `sqlglot`.

  Args:
      text (str | None): Raw LLM response text.

  Returns:
      str | None: Valid SQL query string if found, otherwise None.
  """
  if not text:
    return None

  sql_matches: list[str] = re.findall(r"```sql\s+(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
  for candidate in sql_matches:
    candidate_sql = str(candidate).strip()
    if candidate_sql:
      try:
        if _is_valid_sql_block(candidate_sql):
          return candidate_sql
      except Exception as e:
        logger.warning(f"Explicit SQL block failed validation: {e}")

  generic_matches: list[str] = re.findall(r"```(?:[a-zA-Z0-9_-]+)?\s+(.*?)\s*```", text, re.DOTALL)
  for candidate in generic_matches:
    candidate_sql = str(candidate).strip()
    if candidate_sql:
      try:
        if _is_valid_sql_block(candidate_sql):
          return candidate_sql
      except Exception:
        continue

  return None


def build_chat_system_prompt(schema_context: str) -> str:
  """
  Constructs the system prompt for the Hospital Analytics Chat Assistant.

  Args:
      schema_context (str): Formatted database schema and macro documentation string.

  Returns:
      str: Complete system prompt string.
  """
  header = (
    "You are an expert Hospital Analytics Assistant. "
    "Answer questions using DuckDB SQL based on the schema below. "
    "If the user asks for data, output the SQL Query inside a markdown block ```sql ... ```. "
    "Do not execute DML (INSERT/UPDATE). "
  )
  nl = chr(10)
  return f"{header}{nl}{nl}Schema:{nl}{schema_context}"


class ChatService:
  """
  Domain service orchestrating conversational persistence, candidate voting,
  and LLM Arena candidate generation.
  """

  async def _collect_arena_responses(
    self,
    messages_payload: list[dict[str, str]],
    target_models: list[str] | None,
    admin_settings: AdminSettingsResponse | None,
    arena_client: LLMArenaClient,
  ) -> list[ArenaResponse]:
    """
    Collects candidate responses from the LLM Arena with retry padding up to `target_count`.

    Args:
        messages_payload (list[dict[str, str]]): OpenAI-formatted conversation history.
        target_models (list[str] | None): Optional list of model IDs to query.
        admin_settings (AdminSettingsResponse | None): Active admin settings configuration.
        arena_client (LLMArenaClient): LLM Arena client instance.

    Returns:
        list[ArenaResponse]: Non-empty list of candidate responses.
    """
    try:
      responses: list[ArenaResponse] = await arena_client.generate_arena_competition(
        messages=messages_payload,
        temperature=0.7,
        max_tokens=1000,
        target_model_ids=target_models,
        admin_settings=admin_settings,
      )

      target_count = len(target_models) if (target_models and len(target_models) < 3) else 3
      attempts = 0
      any_success = any(r.error is None for r in responses)

      while len(responses) < target_count and attempts < 3 and any_success:
        attempts += 1
        more = await arena_client.generate_arena_competition(
          messages=messages_payload,
          temperature=0.7 + (attempts * 0.1),
          max_tokens=1000,
          target_model_ids=target_models,
          admin_settings=admin_settings,
        )
        if more:
          responses.extend(more)

      if not responses:
        return [ArenaResponse("System", "error", "I apologize, no models responded.", 0, "All providers failed")]
      return responses

    except Exception as e:
      logger.error(f"LLM Generation Failed: {e}")
      return [ArenaResponse("System", "error", "I apologize, but I am unable to process your request.", 0, str(e))]

  def _persist_candidates(self, db: AsyncSession, assistant_msg_id: UUID, responses: list[ArenaResponse]) -> None:
    """
    Creates and adds `MessageCandidate` ORM objects for each `ArenaResponse`.

    Args:
        db (AsyncSession): Active transactional database session.
        assistant_msg_id (UUID): Parent assistant message UUID.
        responses (list[ArenaResponse]): Arena responses to persist.
    """
    used_names: set[str] = set()
    nl = chr(10)
    for idx, res in enumerate(responses):
      content_to_save = res.content
      if not content_to_save and res.error:
        content_to_save = f"**Generation Failed**{nl}Error: {res.error}"
      elif not content_to_save:
        content_to_save = "(Empty Response)"

      sql_code = extract_and_validate_chat_sql(content_to_save)
      sql_hash = sql_fingerprint(sql_code) if sql_code else None

      tag = f"{res.provider_name} {idx + 1}" if res.provider_name in used_names else res.provider_name
      used_names.add(tag)

      db.add(
        MessageCandidate(
          message_id=assistant_msg_id,
          model_name=tag,
          content=content_to_save,
          sql_snippet=sql_code,
          sql_hash=sql_hash,
          is_selected=False,
        )
      )

  async def generate_assistant_reply(
    self,
    db: AsyncSession,
    conversation_id: UUID,
    history_limit: int = 10,
    target_models: list[str] | None = None,
    arena_client: LLMArenaClient = llm_client,
    schema_svc: SchemaService = schema_service,
    admin_settings_fn: AdminSettingsFn = get_admin_settings,
  ) -> Message:
    """
    Orchestrates the AI interaction loop with Arena Voting and persists `MessageCandidate` records.

    Args:
        db (AsyncSession): Active transactional database session.
        conversation_id (UUID): Target conversation UUID.
        history_limit (int): Maximum number of prior turns to include.
        target_models (list[str] | None): Optional list of specific model IDs to query.
        arena_client (LLMArenaClient): LLM Arena client instance.
        schema_svc (SchemaService): Schema service instance.
        admin_settings_fn (AdminSettingsFn): Async callable returning admin settings.

    Returns:
        Message: Persisted assistant `Message` instance with loaded `candidates`.
    """
    stmt = (
      select(Message)
      .where(Message.conversation_id == conversation_id)
      .order_by(desc(Message.created_at))
      .limit(history_limit)
    )
    result = await db.execute(stmt)
    history_objs = result.scalars().all()[::-1]

    schema_context = await asyncio.to_thread(schema_svc.get_schema_context_string)
    system_prompt = build_chat_system_prompt(schema_context)
    messages_payload: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for msg in history_objs:
      messages_payload.append({"role": msg.role, "content": msg.content})

    admin_settings = await admin_settings_fn(db)
    responses = await self._collect_arena_responses(messages_payload, target_models, admin_settings, arena_client)

    now = datetime.now(UTC)
    assistant_msg = Message(
      conversation_id=conversation_id,
      role="assistant",
      content="Multiple options generated. Please select the best response.",
      sql_snippet=None,
      created_at=now,
    )
    db.add(assistant_msg)
    await db.flush()

    self._persist_candidates(db, assistant_msg.id, responses)

    await db.execute(update(Conversation).where(Conversation.id == conversation_id).values(updated_at=now))
    await db.commit()

    reload_stmt = select(Message).where(Message.id == assistant_msg.id).options(selectinload(Message.candidates))
    reload_res = await db.execute(reload_stmt)
    reloaded = reload_res.scalars().first()
    return reloaded if reloaded is not None else assistant_msg

  async def list_conversations(
    self,
    current_user: User,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
  ) -> list[Conversation]:
    """
    Lists recent conversations owned by `current_user`.

    Args:
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        limit (int): Maximum number of conversations to return.
        offset (int): Pagination offset.

    Returns:
        list[Conversation]: Ordered list of user conversations.
    """
    stmt = (
      select(Conversation)
      .where(Conversation.user_id == current_user.id)
      .order_by(desc(Conversation.updated_at))
      .offset(offset)
      .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())

  async def create_conversation(
    self,
    payload: ConversationCreate,
    current_user: User,
    db: AsyncSession,
    reply_fn: Callable[..., Awaitable[Message]] | None = None,
  ) -> Conversation:
    """
    Creates a new conversation and optionally seeds the initial user message and assistant reply.

    Args:
        payload (ConversationCreate): Creation payload (`title`, `message`, `target_models`).
        current_user (User): Authenticated owner.
        db (AsyncSession): Active database session.
        reply_fn (Callable[..., Awaitable[Message]] | None): Optional reply generator override.

    Returns:
        Conversation: Newly created conversation with loaded `messages` and `candidates`.
    """
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
      generator = reply_fn if reply_fn is not None else self.generate_assistant_reply
      await generator(db, conv.id, target_models=payload.target_models)
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

  async def get_owned_conversation_result(
    self,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Conversation]:
    """
    Fetches a conversation owned by `current_user`, returning an explicit `AppResult`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Conversation]: `Ok(Conversation)` if found and owned, else `Err(AppError)`.
    """
    result = await db.execute(
      select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
    )
    conv = result.scalars().first()
    if not conv:
      return Err(AppError(code=ErrorCode.CONVERSATION_NOT_FOUND, message="Conversation not found", status_code=404))
    return Ok(conv)

  async def update_conversation_result(
    self,
    conversation_id: UUID,
    payload: ConversationUpdate,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Conversation]:
    """
    Updates the title of an existing conversation owned by `current_user`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        payload (ConversationUpdate): Title update payload.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Conversation]: `Ok(Conversation)` or `Err(AppError)`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    conv = conv_res.value
    conv.title = payload.title
    await db.commit()
    await db.refresh(conv)
    return Ok(conv)

  async def delete_conversation_result(
    self,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[bool]:
    """
    Deletes a conversation and cascades to its messages and candidates.

    Args:
        conversation_id (UUID): Target conversation UUID.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[bool]: `Ok(True)` if deleted, else `Err(AppError)`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    await db.delete(conv_res.value)
    await db.commit()
    return Ok(True)

  async def get_messages_result(
    self,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[list[Message]]:
    """
    Returns ordered messages and candidates for a conversation owned by `current_user`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[list[Message]]: `Ok(messages)` or `Err(AppError)`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    msg_result = await db.execute(
      select(Message)
      .where(Message.conversation_id == conversation_id)
      .options(selectinload(Message.candidates))
      .order_by(Message.created_at)
    )
    return Ok(list(msg_result.scalars().all()))

  async def send_message_result(
    self,
    conversation_id: UUID,
    payload: MessageCreate,
    current_user: User,
    db: AsyncSession,
    reply_fn: Callable[..., Awaitable[Message]] | None = None,
  ) -> AppResult[Message]:
    """
    Appends a user message to `conversation_id` and generates assistant candidates.

    Args:
        conversation_id (UUID): Target conversation UUID.
        payload (MessageCreate): User message payload.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        reply_fn (Callable[..., Awaitable[Message]] | None): Optional reply generator override.

    Returns:
        AppResult[Message]: `Ok(assistant_message)` or `Err(AppError)`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    conv = conv_res.value
    now = datetime.now(UTC)
    user_msg = Message(conversation_id=conversation_id, role="user", content=payload.content, created_at=now)
    db.add(user_msg)
    conv.updated_at = now
    await db.commit()

    generator = reply_fn if reply_fn is not None else self.generate_assistant_reply
    reply = await generator(db, conversation_id, target_models=payload.target_models)
    return Ok(reply)

  async def vote_candidate_result(
    self,
    conversation_id: UUID,
    message_id: UUID,
    payload: MessageVoteRequest,
    current_user: User,
    db: AsyncSession,
  ) -> AppResult[Message]:
    """
    Records a user's vote for a candidate belonging to `message_id` inside `conversation_id`.

    Verifies strict ownership and parent-child linkage (`Conversation -> Message -> MessageCandidate`)
    to prevent cross-conversation or cross-message candidate tampering.

    Args:
        conversation_id (UUID): Target conversation UUID.
        message_id (UUID): Target assistant message UUID.
        payload (MessageVoteRequest): Selected candidate UUID payload.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.

    Returns:
        AppResult[Message]: `Ok(updated_message)` or `Err(AppError)`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    msg_stmt = select(Message).where(
      and_(
        Message.id == message_id,
        Message.conversation_id == conversation_id,
        Message.role == "assistant",
      )
    )
    msg_obj = (await db.execute(msg_stmt)).scalars().first()
    if msg_obj is None:
      return Err(AppError(code=ErrorCode.MESSAGE_NOT_FOUND, message="Message not found", status_code=404))

    stmt_cand = select(MessageCandidate).where(MessageCandidate.id == payload.candidate_id)
    target_candidate = (await db.execute(stmt_cand)).scalars().first()
    if not target_candidate:
      return Err(AppError(code=ErrorCode.CANDIDATE_NOT_FOUND, message="Candidate not found", status_code=404))
    if target_candidate.message_id != message_id:
      return Err(AppError(code=ErrorCode.CANDIDATE_MESSAGE_MISMATCH, message="Candidate not found", status_code=404))

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
      await db.execute(
        update(MessageCandidate)
        .where(and_(MessageCandidate.id == payload.candidate_id, MessageCandidate.message_id == message_id))
        .values(is_selected=True)
      )

    await db.execute(
      update(Message)
      .where(and_(Message.id == message_id, Message.conversation_id == conversation_id))
      .values(content=winning_content, sql_snippet=winning_sql)
    )
    await db.commit()
    db.expire_all()

    final_stmt = select(Message).where(Message.id == message_id).options(selectinload(Message.candidates))
    final_msg = (await db.execute(final_stmt)).scalars().first()
    return Ok(final_msg if final_msg is not None else msg_obj)

  async def prepare_stream_context_result(
    self,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession,
    history_limit: int = 10,
    schema_svc: SchemaService = schema_service,
    admin_settings_fn: AdminSettingsFn = get_admin_settings,
  ) -> AppResult[tuple[list[dict[str, str]], AdminSettingsResponse]]:
    """
    Validates conversation ownership and builds the LLM message payload and admin settings for SSE streaming.

    Args:
        conversation_id (UUID): Target conversation UUID.
        current_user (User): Authenticated user owning the conversation.
        db (AsyncSession): Active database session.
        history_limit (int): Maximum number of historical turns to include.
        schema_svc (SchemaService): Schema service instance.
        admin_settings_fn (AdminSettingsFn): Async callable returning admin settings.

    Returns:
        AppResult[tuple[list[dict[str, str]], AdminSettingsResponse]]: `Ok((messages_payload, admin_settings))` or `Err`.
    """
    conv_res = await self.get_owned_conversation_result(conversation_id, current_user, db)
    if isinstance(conv_res, Err):
      return conv_res

    hist_stmt = (
      select(Message)
      .where(Message.conversation_id == conversation_id)
      .order_by(desc(Message.created_at))
      .limit(history_limit)
    )
    hist_res = await db.execute(hist_stmt)
    history = hist_res.scalars().all()[::-1]

    schema_context = await asyncio.to_thread(schema_svc.get_schema_context_string)
    system_prompt = build_chat_system_prompt(schema_context)
    messages_payload: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for msg in history:
      if msg.role in ["user", "assistant"]:
        messages_payload.append({"role": msg.role, "content": msg.content})

    admin_settings = await admin_settings_fn(db)
    return Ok((messages_payload, admin_settings))

  async def stream_conversation_events(
    self,
    conversation_id: UUID,
    messages_payload: list[dict[str, str]],
    admin_settings: AdminSettingsResponse | None,
    db: AsyncSession,
    model_id: str | None = None,
    arena_client: LLMArenaClient = llm_client,
  ) -> AsyncGenerator[str, None]:
    """
    Streams Server-Sent Events (`start`, `token`, `done`) and persists the final assistant `Message`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        messages_payload (list[dict[str, str]]): OpenAI-formatted prompt and history messages.
        admin_settings (AdminSettingsResponse | None): Active admin settings configuration.
        db (AsyncSession): Active database session for persisting the final message.
        model_id (str | None): Optional target model identifier.
        arena_client (LLMArenaClient): LLM Arena client instance.

    Yields:
        str: Formatted SSE event frames (`start`, `token`, `done`).
    """
    nl = chr(10)
    start_payload = json.dumps({"event": "start", "conversation_id": str(conversation_id)})
    yield f"data: {start_payload}{nl}{nl}"

    accumulated: list[str] = []
    async for token in arena_client.stream_tokens(
      messages=messages_payload,
      model_id=model_id,
      admin_settings=admin_settings,
    ):
      accumulated.append(token)
      payload = json.dumps({"event": "token", "token": token})
      yield f"data: {payload}{nl}{nl}"

    full_text = "".join(accumulated)
    sql = extract_and_validate_chat_sql(full_text)

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
    yield f"data: {done_payload}{nl}{nl}"


chat_service = ChatService()
