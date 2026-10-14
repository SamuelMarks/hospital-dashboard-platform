"""
Chat Domain Service Module.

Encapsulates SQL extraction/validation from Markdown chat responses,
system prompt assembly using `SchemaService`, and multi-LLM Arena candidate
generation for conversational analytics.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import sqlglot
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import Conversation, Message, MessageCandidate
from app.services.admin import get_admin_settings
from app.services.llm_client import ArenaResponse, llm_client
from app.services.schema import schema_service
from app.services.sql_utils import sql_fingerprint

logger = logging.getLogger(__name__)


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


def extract_and_validate_chat_sql(text: str) -> str | None:
  """
  Scans text for Markdown SQL blocks, extracts the first valid statement,
  and performs a syntax check using `sqlglot`.

  Args:
      text (str): Raw LLM response text.

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
  return "\n\n".join([header, f"Schema:\n{schema_context}"])


class ChatService:
  """
  Domain service orchestrating conversational LLM Arena candidate generation.
  """

  async def _collect_arena_responses(
    self,
    messages_payload: list[dict[str, str]],
    target_models: list[str] | None,
    admin_settings: Any,
    arena_client: Any,
  ) -> list[ArenaResponse]:
    """
    Collects candidate responses from the LLM Arena with retry padding up to `target_count`.

    Args:
        messages_payload (list[dict[str, str]]): OpenAI-formatted conversation history.
        target_models (list[str] | None): Optional list of model IDs to query.
        admin_settings (Any): Active admin settings configuration.
        arena_client (Any): LLM Arena client instance.

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
    for idx, res in enumerate(responses):
      content_to_save = res.content
      if not content_to_save and res.error:
        content_to_save = "\n".join(["**Generation Failed**", f"Error: {res.error}"])
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
    arena_client: Any = llm_client,
    schema_svc: Any = schema_service,
    admin_settings_fn: Any = get_admin_settings,
  ) -> Message:
    """
    Orchestrates the AI interaction loop with Arena Voting and persists `MessageCandidate` records.

    Args:
        db (AsyncSession): Active transactional database session.
        conversation_id (UUID): Target conversation UUID.
        history_limit (int): Maximum number of prior turns to include.
        target_models (list[str] | None): Optional list of specific model IDs to query.
        arena_client (Any): LLM Arena client instance.
        schema_svc (Any): Schema service instance.
        admin_settings_fn (Any): Async callable returning admin settings.

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

    schema_context = schema_svc.get_schema_context_string()
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


chat_service = ChatService()
