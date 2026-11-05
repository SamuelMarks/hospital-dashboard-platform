"""
Chat Domain Service Module.

Encapsulates SQL extraction/validation from Markdown chat responses,
system prompt assembly using `SchemaService`, conversation/message persistence,
candidate voting, direct read-only DuckDB SQL execution, and multi-LLM Arena candidate
generation for conversational analytics.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable, Sequence
from datetime import UTC, datetime
import json
import logging
import re
import time
from uuid import UUID

import httpx
from sqlalchemy import and_, desc, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import sqlglot

from app.core.i18n import get_translated_message
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import SQLExecutionRequest
from app.schemas.chat import (
  ConversationCreate,
  ConversationUpdate,
  MessageCreate,
  MessageVoteRequest,
  SqlPreviewPayload,
)
from app.schemas.json_types import SqlRow
from app.services.admin import get_admin_settings
from app.services.llm.error_classifier import classify_llm_error, format_classified_error_markdown
from app.services.llm_client import ArenaResponse, LLMArenaClient, SwarmCombatantDict, llm_client, pad_arena_responses
from app.services.schema import SchemaService, schema_service
from app.services.sql_generator import sql_generator
from app.services.sql_utils import sql_fingerprint

logger = logging.getLogger(__name__)

AdminSettingsFn = Callable[[AsyncSession], Awaitable[AdminSettingsResponse]]

_DIRECT_SQL_MODEL_IDS: frozenset[str] = frozenset({"sql", "sql [no model]", "sql/duckdb", "sql:duckdb"})

_MODEL_IDENTITY_QUERY_RE: re.Pattern[str] = re.compile(
  r"^\s*(?:what\s+is\s+my\s+model|what\s+model\s+(?:are\s+you|is\s+this|am\s+i\s+using)|which\s+(?:model|llm)\s+(?:are\s+you|is\s+this|am\s+i\s+using)|what\s+is\s+your\s+model(?:\s+name)?)\s*[?.!]*\s*$",
  re.IGNORECASE,
)

_RAW_SQL_START_RE: re.Pattern[str] = re.compile(
  r"^\s*(?:--|/\*|SELECT\b|WITH\b|PRAGMA\b|EXPLAIN\b|VALUES\b|SHOW\b|DESCRIBE\b)",
  re.IGNORECASE,
)


def is_model_identity_query(user_query: str | None) -> bool:
  """
  Checks whether the user prompt is a meta-question asking for the active LLM model identifier
  (e.g., `'What is my model'`).

  Args:
      user_query (str | None): Raw user message text.

  Returns:
      bool: True if the query asks for the active model identity, False otherwise.
  """
  if not user_query:
    return False
  return bool(_MODEL_IDENTITY_QUERY_RE.match(user_query.strip()))


def _resolve_combatant_identifier(combatant: SwarmCombatantDict) -> str:
  """
  Resolves the canonical model identifier from a swarm combatant dictionary,
  falling back to `model_name`, `name`, or `'unknown'` without assuming a specific model.

  Args:
      combatant (SwarmCombatantDict): Active swarm combatant dictionary.

  Returns:
      str: Resolved model identifier string.
  """
  raw_id = combatant.get("id") or combatant.get("model_name") or combatant.get("name") or "unknown"
  return str(raw_id).strip() or "unknown"


def build_model_identity_sql_block(model_identifier: str, provider_name: str = "") -> str:
  """
  Constructs a SQL-only markdown block answering a model-identity query using a `SELECT '<model>'`
  query and `--` SQL comments explaining the SQL.

  Args:
      model_identifier (str): Model identifier string (e.g., `'ollama:gemma:2b'`).
      provider_name (str): Human-readable provider display name.

  Returns:
      str: Markdown ` ```sql ` block containing only `--` SQL comments and a `SELECT` statement.
  """
  clean_model = model_identifier.strip()
  for prefix in (
    "ollama:",
    "ollama/",
    "gemma4sql:",
    "gemma4sql/",
    "gemma-4-sql:",
    "gemma-4-sql/",
    "gemini:",
    "gemini/",
    "openai:",
    "openai/",
    "anthropic:",
    "anthropic/",
    "mistral:",
    "mistral/",
    "llamacpp:",
    "llamacpp/",
    "mock:",
    "mock/",
  ):
    if clean_model.lower().startswith(prefix):
      clean_model = clean_model[len(prefix) :]
      break
  safe_literal = clean_model.replace("'", "''") or "unknown"
  label = provider_name.strip() or model_identifier.strip() or safe_literal
  nl = chr(10)
  return f"```sql{nl}-- Active LLM processor for this query: {label}{nl}SELECT '{safe_literal}' AS model;{nl}```"


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


def _validate_first_sql_candidate(candidates: Sequence[str], log_failures: bool = False) -> str | None:
  """
  Iterates over candidate SQL strings and returns the first one that validates as DuckDB SQL.

  Args:
      candidates (Sequence[str]): Candidate SQL snippets to validate.
      log_failures (bool): Whether to log a warning when `sqlglot` validation raises an error.

  Returns:
      str | None: First valid SQL query string, or None if none validate.
  """
  for candidate in candidates:
    candidate_sql = str(candidate).strip()
    if candidate_sql:
      try:
        if _is_valid_sql_block(candidate_sql):
          return candidate_sql
      except (sqlglot.errors.SqlglotError, ValueError, TypeError, RuntimeError) as e:
        if log_failures:
          logger.warning(f"Explicit SQL block failed validation: {e}")
  return None


def extract_and_validate_chat_sql(text: str | None) -> str | None:
  """
  Scans text for Markdown SQL blocks (or raw SQL + SQL comments if no code fence is present),
  extracts the first valid statement, and performs a syntax check using `sqlglot`.

  Args:
      text (str | None): Raw LLM response text or raw SQL input.

  Returns:
      str | None: Valid SQL query string if found, otherwise None.
  """
  if not text:
    return None

  sql_matches: list[str] = re.findall(r"```sql\s+(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
  explicit_valid = _validate_first_sql_candidate(sql_matches, log_failures=True)
  if explicit_valid is not None:
    return explicit_valid

  generic_matches: list[str] = re.findall(r"```(?:[a-zA-Z0-9_-]+)?\s+(.*?)\s*```", text, re.DOTALL)
  generic_valid = _validate_first_sql_candidate(generic_matches, log_failures=False)
  if generic_valid is not None:
    return generic_valid

  stripped_raw = text.strip()
  if "```" not in stripped_raw and _RAW_SQL_START_RE.match(stripped_raw):
    return _validate_first_sql_candidate([stripped_raw], log_failures=False)

  return None


async def execute_readonly_duckdb_preview(
  sql: str,
  max_rows: int = 50,
) -> SqlPreviewPayload:
  """
  Executes a validated SQL query against the read-only DuckDB analytical engine
  and returns a bounded `SqlPreviewPayload`.

  Args:
      sql (str): Read-only SQL query string to execute.
      max_rows (int): Maximum number of rows to return in the preview.

  Returns:
      SqlPreviewPayload: Tabular preview data, columns, latency, and optional error string.
  """
  start = time.perf_counter()
  res = await sql_generator.execute_sql_preview_result(SQLExecutionRequest(sql=sql, max_rows=max_rows))
  elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
  if isinstance(res, Err):
    return SqlPreviewPayload(
      columns=[],
      data=[],
      row_count=0,
      execution_time_ms=elapsed_ms,
      truncated=False,
      error=res.error.message,
    )
  val = res.value
  return SqlPreviewPayload(
    columns=val.columns,
    data=val.data,
    row_count=len(val.data),
    execution_time_ms=elapsed_ms,
    truncated=len(val.data) >= max_rows,
    error=val.error,
  )


def build_chat_system_prompt(schema_context: str) -> str:
  """
  Constructs the system prompt for the Hospital Analytics Chat Assistant.

  Enforces the strict platform policy that LLMs are ONLY permitted to generate
  read-only DuckDB SQL and SQL comments (`-- ...`) explaining the SQL.

  Args:
      schema_context (str): Formatted database schema and macro documentation string.

  Returns:
      str: Complete system prompt string.
  """
  header = (
    "You are an expert Hospital Analytics SQL Generator. "
    "You are ONLY permitted to generate valid read-only DuckDB SQL and SQL comments (-- ...) explaining the SQL. "
    "Output your response strictly inside a single markdown block ```sql ... ``` containing only SQL comments and SQL statements. "
    "Never output conversational prose outside SQL comments. "
    "If the user asks for your model name, output `SELECT '<model_name>' AS model;` with a `--` SQL comment. "
    "Do not execute or generate DML/DDL (INSERT/UPDATE/DELETE/DROP)."
  )
  nl = chr(10)
  return f"{header}{nl}{nl}Schema:{nl}{schema_context}"


def _format_markdown_table(columns: Sequence[str], data: Sequence[SqlRow]) -> str:
  """
  Formats tabular query results into a standard Markdown table string.

  Args:
      columns (Sequence[str]): Ordered column names from the query result.
      data (Sequence[SqlRow]): Sequence of row mappings.

  Returns:
      str: Formatted Markdown table string, or `'_No rows returned._'` if empty.
  """
  resolved_cols = list(columns) if columns else (list(data[0].keys()) if data else [])
  if not resolved_cols:
    return "_No rows returned._"
  nl = chr(10)
  escaped_headers = [str(col).replace("|", "\\|") for col in resolved_cols]
  header_line = "| " + " | ".join(escaped_headers) + " |"
  separator_line = "| " + " | ".join(["---"] * len(resolved_cols)) + " |"
  if not data:
    return f"{header_line}{nl}{separator_line}{nl}{nl}_No rows returned._"
  row_lines: list[str] = []
  for row in data:
    cells = [
      str(row.get(col, "") if row.get(col) is not None else "").replace("|", "\\|").replace(nl, " ")
      for col in resolved_cols
    ]
    row_lines.append("| " + " | ".join(cells) + " |")
  return nl.join([header_line, separator_line, *row_lines])


class ChatService:
  """
  Domain service orchestrating conversational persistence, candidate voting,
  direct read-only DuckDB execution, and LLM Arena candidate generation.
  """

  async def _build_direct_sql_arena_response(
    self,
    messages_payload: list[dict[str, str]],
  ) -> ArenaResponse:
    """
    Executes raw user SQL directly against read-only DuckDB when the `'SQL'` (`SQL [no model]`)
    processor is selected.

    Does not wrap the SQL query in a ` ```sql ` code fence so that the UI does not redundantly
    display a `'Suggested Query'` block for a query the user authored directly; instead renders
    the execution summary and a Markdown table of the results.

    Args:
        messages_payload (list[dict[str, str]]): Conversation messages ending with the user's SQL query.

    Returns:
        ArenaResponse: Direct SQL candidate containing the execution summary and Markdown result table.
    """
    start = time.perf_counter()
    user_msgs = [m.get("content", "") for m in messages_payload if m.get("role") == "user"]
    raw_input = (user_msgs[-1] if user_msgs else "").strip()
    extracted = extract_and_validate_chat_sql(raw_input) or raw_input
    preview = await execute_readonly_duckdb_preview(extracted, max_rows=50)
    duration_ms = int((time.perf_counter() - start) * 1000)
    nl = chr(10)
    if preview.error:
      return ArenaResponse(
        provider_name="SQL [no model]",
        model_identifier="SQL",
        content=f"**DuckDB Validation Error:** {preview.error}",
        latency_ms=duration_ms,
        error=None,
      )
    md_table = _format_markdown_table(preview.columns, preview.data)
    return ArenaResponse(
      provider_name="SQL [no model]",
      model_identifier="SQL",
      content=(
        f"Executed directly on read-only DuckDB ({preview.row_count} rows returned in {preview.execution_time_ms}ms)."
        f"{nl}{nl}{md_table}"
      ),
      latency_ms=duration_ms,
      error=None,
    )

  def _build_model_identity_arena_responses(
    self,
    llm_targets: list[str] | None,
    arena_client: LLMArenaClient,
  ) -> list[ArenaResponse]:
    """
    Constructs SQL-only `ArenaResponse` items answering a model-identity query for each target model.

    Args:
        llm_targets (list[str] | None): Explicitly requested LLM identifiers, if any.
        arena_client (LLMArenaClient): Arena client containing active swarm combatants.

    Returns:
        list[ArenaResponse]: SQL-only candidate responses identifying each active model.
    """
    resolved_ids = (
      [mid.strip() or "unknown" for mid in llm_targets]
      if llm_targets
      else [_resolve_combatant_identifier(c) for c in arena_client.swarm]
    )
    if not resolved_ids:
      resolved_ids = ["unknown"]
    return [
      ArenaResponse(
        provider_name=mid,
        model_identifier=mid,
        content=build_model_identity_sql_block(mid, mid),
        latency_ms=1,
        error=None,
      )
      for mid in resolved_ids
    ]

  async def _collect_arena_responses(
    self,
    messages_payload: list[dict[str, str]],
    target_models: list[str] | None,
    admin_settings: AdminSettingsResponse | None,
    arena_client: LLMArenaClient,
  ) -> list[ArenaResponse]:
    """
    Collects candidate responses from the LLM Arena (and/or direct DuckDB SQL processor)
    with retry padding up to `target_count`.

    Args:
        messages_payload (list[dict[str, str]]): OpenAI-formatted conversation history.
        target_models (list[str] | None): Optional list of model IDs to query.
        admin_settings (AdminSettingsResponse | None): Active admin settings configuration.
        arena_client (LLMArenaClient): LLM Arena client instance.

    Returns:
        list[ArenaResponse]: Non-empty list of candidate responses.
    """
    try:
      direct_sql_requested = bool(
        target_models and any(t.strip().lower() in _DIRECT_SQL_MODEL_IDS for t in target_models)
      )
      llm_targets = (
        [t for t in target_models if t.strip().lower() not in _DIRECT_SQL_MODEL_IDS]
        if target_models is not None
        else None
      )

      responses: list[ArenaResponse] = []
      if direct_sql_requested:
        responses.append(await self._build_direct_sql_arena_response(messages_payload))
        if not llm_targets:
          return responses

      user_msgs = [m.get("content", "") for m in messages_payload if m.get("role") == "user"]
      latest_user_msg = (user_msgs[-1] if user_msgs else "").strip()
      if is_model_identity_query(latest_user_msg):
        responses.extend(self._build_model_identity_arena_responses(llm_targets, arena_client))
        return responses

      target_count = len(target_models) if (target_models and len(target_models) < 3) else 3
      responses = await pad_arena_responses(
        arena_client=arena_client,
        messages=messages_payload,
        target_count=target_count,
        temperature=0.7,
        max_tokens=1000,
        target_model_ids=llm_targets,
        admin_settings=admin_settings,
        initial_responses=responses,
      )

      if not responses:
        return [ArenaResponse("System", "error", "I apologize, no models responded.", 0, "All providers failed")]
      return responses

    except (httpx.HTTPError, SQLAlchemyError, RuntimeError, ValueError, TypeError, OSError) as e:
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
    auto_select_single_sql = (
      len(responses) == 1 and responses[0].model_identifier.strip().lower() in _DIRECT_SQL_MODEL_IDS
    )
    for idx, res in enumerate(responses):
      content_to_save = res.content
      if not content_to_save and res.error:
        classified = classify_llm_error(res.provider_name, res.model_identifier, res.error)
        content_to_save = format_classified_error_markdown(classified)
      elif not content_to_save:
        content_to_save = "(Empty Response)"

      is_direct_sql = res.model_identifier.strip().lower() in _DIRECT_SQL_MODEL_IDS
      sql_code = None if is_direct_sql else extract_and_validate_chat_sql(content_to_save)
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
          is_selected=auto_select_single_sql,
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

    is_single_direct_sql = len(responses) == 1 and responses[0].model_identifier.strip().lower() in _DIRECT_SQL_MODEL_IDS
    initial_content = (
      responses[0].content if is_single_direct_sql else "Multiple options generated. Please select the best response."
    )

    now = datetime.now(UTC)
    assistant_msg = Message(
      conversation_id=conversation_id,
      role="assistant",
      content=initial_content,
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

  async def generate_assistant_reply_result(
    self,
    db: AsyncSession,
    conversation_id: UUID,
    history_limit: int = 10,
    target_models: list[str] | None = None,
    arena_client: LLMArenaClient = llm_client,
    schema_svc: SchemaService = schema_service,
    admin_settings_fn: AdminSettingsFn = get_admin_settings,
  ) -> AppResult[Message]:
    """
    Executes `generate_assistant_reply` and returns the persisted assistant `Message` wrapped in `AppResult[Message]`.

    Args:
        db (AsyncSession): Active transactional database session.
        conversation_id (UUID): Target conversation UUID.
        history_limit (int): Maximum number of prior turns to include.
        target_models (list[str] | None): Optional list of specific model IDs to query.
        arena_client (LLMArenaClient): LLM Arena client instance.
        schema_svc (SchemaService): Schema service instance.
        admin_settings_fn (AdminSettingsFn): Async callable returning admin settings.

    Returns:
        AppResult[Message]: `Ok(assistant_message)` with loaded `candidates`.
    """
    msg = await self.generate_assistant_reply(
      db=db,
      conversation_id=conversation_id,
      history_limit=history_limit,
      target_models=target_models,
      arena_client=arena_client,
      schema_svc=schema_svc,
      admin_settings_fn=admin_settings_fn,
    )
    return Ok(msg)

  async def list_conversations_result(
    self,
    current_user: User,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
  ) -> AppResult[list[Conversation]]:
    """
    Lists recent conversations owned by `current_user` wrapped in `AppResult`.

    Args:
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        limit (int): Maximum number of conversations to return.
        offset (int): Pagination offset.

    Returns:
        AppResult[list[Conversation]]: `Ok(conversations)` ordered newest first.
    """
    stmt = (
      select(Conversation)
      .where(Conversation.user_id == current_user.id)
      .order_by(desc(Conversation.updated_at))
      .offset(offset)
      .limit(limit)
    )
    result = await db.execute(stmt)
    return Ok(list(result.scalars().all()))

  async def create_conversation_result(
    self,
    payload: ConversationCreate,
    current_user: User,
    db: AsyncSession,
    reply_fn: Callable[..., Awaitable[Message]] | None = None,
  ) -> AppResult[Conversation]:
    """
    Creates a new conversation and optionally seeds the initial user message and assistant reply,
    returning `AppResult[Conversation]`.

    Args:
        payload (ConversationCreate): Creation payload (`title`, `message`, `target_models`).
        current_user (User): Authenticated owner.
        db (AsyncSession): Active database session.
        reply_fn (Callable[..., Awaitable[Message]] | None): Optional reply generator override.

    Returns:
        AppResult[Conversation]: `Ok(conversation)` with loaded `messages` and `candidates`.
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
    return Ok(reloaded if reloaded is not None else conv)

  async def get_owned_conversation_result(
    self,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession,
    accept_language: str | None = None,
  ) -> AppResult[Conversation]:
    """
    Fetches a conversation owned by `current_user`, returning an explicit `AppResult`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        current_user (User): Authenticated user.
        db (AsyncSession): Active database session.
        accept_language (str | None): Optional HTTP `Accept-Language` header for localized error messages.

    Returns:
        AppResult[Conversation]: `Ok(Conversation)` if found and owned, else `Err(AppError)`.
    """
    result = await db.execute(
      select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
    )
    conv = result.scalars().first()
    if not conv:
      msg = get_translated_message(accept_language, "error.conversation_not_found", "Conversation not found")
      return Err(AppError(code=ErrorCode.CONVERSATION_NOT_FOUND, message=msg, status_code=404))
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
    using eager loading (`selectinload(Message.candidates)`) and updates candidate selection in a
    single transactional round-trip.

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

    msg_stmt = (
      select(Message)
      .where(
        and_(
          Message.id == message_id,
          Message.conversation_id == conversation_id,
          Message.role == "assistant",
        )
      )
      .options(selectinload(Message.candidates))
    )
    msg_obj = (await db.execute(msg_stmt)).scalars().first()
    if msg_obj is None:
      msg = get_translated_message(None, "error.message_not_found", "Message not found")
      return Err(AppError(code=ErrorCode.MESSAGE_NOT_FOUND, message=msg, status_code=404))

    target_candidate = next((c for c in msg_obj.candidates if c.id == payload.candidate_id), None)
    if target_candidate is None:
      cand_msg = get_translated_message(None, "error.candidate_not_found", "Candidate not found")
      return Err(AppError(code=ErrorCode.CANDIDATE_NOT_FOUND, message=cand_msg, status_code=404))

    winning_content = target_candidate.content or ""
    winning_sql = target_candidate.sql_snippet or None
    winning_hash = target_candidate.sql_hash

    for cand in msg_obj.candidates:
      if winning_hash:
        cand.is_selected = cand.sql_hash == winning_hash
      else:
        cand.is_selected = cand.id == payload.candidate_id

    msg_obj.content = winning_content
    msg_obj.sql_snippet = winning_sql
    await db.commit()
    return Ok(msg_obj)

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
    Streams Server-Sent Events (`start`, `token`, `done`, or `error`) and persists the final assistant `Message`.

    Args:
        conversation_id (UUID): Target conversation UUID.
        messages_payload (list[dict[str, str]]): OpenAI-formatted prompt and history messages.
        admin_settings (AdminSettingsResponse | None): Active admin settings configuration.
        db (AsyncSession): Active database session for persisting the final message.
        model_id (str | None): Optional target model identifier.
        arena_client (LLMArenaClient): LLM Arena client instance.

    Yields:
        str: Formatted SSE event frames (`start`, `token`, `done`, or `error`).
    """
    nl = chr(10)
    start_payload = json.dumps({"event": "start", "conversation_id": str(conversation_id)})
    yield f"data: {start_payload}{nl}{nl}"

    accumulated: list[str] = []
    user_msgs = [m.get("content", "") for m in messages_payload if m.get("role") == "user"]
    latest_user_msg = (user_msgs[-1] if user_msgs else "").strip()
    try:
      if model_id and model_id.strip().lower() in _DIRECT_SQL_MODEL_IDS:
        direct_res = await self._build_direct_sql_arena_response(messages_payload)
        for word in direct_res.content.split(" "):
          token_str = word + " "
          accumulated.append(token_str)
          payload = json.dumps({"event": "token", "token": token_str})
          yield f"data: {payload}{nl}{nl}"
      elif is_model_identity_query(latest_user_msg):
        active_id = (
          model_id.strip()
          if model_id and model_id.strip()
          else (_resolve_combatant_identifier(arena_client.swarm[0]) if arena_client.swarm else "unknown")
        )
        identity_sql = build_model_identity_sql_block(active_id, active_id)
        for word in identity_sql.split(" "):
          token_str = word + " "
          accumulated.append(token_str)
          payload = json.dumps({"event": "token", "token": token_str})
          yield f"data: {payload}{nl}{nl}"
      else:
        async for token in arena_client.stream_tokens(
          messages=messages_payload,
          model_id=model_id,
          admin_settings=admin_settings,
        ):
          accumulated.append(token)
          payload = json.dumps({"event": "token", "token": token})
          yield f"data: {payload}{nl}{nl}"
    except (httpx.HTTPError, SQLAlchemyError, RuntimeError, ValueError, TypeError, OSError) as exc:
      logger.error(f"SSE token streaming failed for conversation {conversation_id}: {exc}")
      classified = classify_llm_error(provider=model_id or "llm", model=model_id or "default", raw_error=exc)
      err_payload = json.dumps(
        {
          "event": "error",
          "error": str(exc),
          "code": str(classified.code),
          "remediation": str(classified.details.get("remediation") or ""),
        }
      )
      yield f"data: {err_payload}{nl}{nl}"
      return

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
