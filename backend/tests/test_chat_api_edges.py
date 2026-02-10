"""
Additional tests for chat router edge cases.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.api.routers import chat as chat_router
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.user import User
from app.services.llm_client import ArenaResponse


@pytest.fixture
async def chat_user(db_session):
  """Create a user and override auth dependency."""
  user = User(email=f"edge_{uuid.uuid4()}@example.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: user
  yield user
  app.dependency_overrides = {}


def test_extract_and_validate_sql_empty_block() -> None:
  """Empty SQL blocks should return None."""
  assert chat_router._extract_and_validate_sql("```sql\n\n```") is None


def test_extract_and_validate_sql_invalid_sql() -> None:
  """Invalid SQL should return None."""
  assert chat_router._extract_and_validate_sql("```sql\nSELEC * FROM t\n```") is None


@pytest.mark.asyncio
async def test_generate_assistant_reply_expands_candidates(db_session, chat_user) -> None:
  """When fewer than 3 responses are returned, extras should be generated."""
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="user", content="Hi")
  db_session.add(msg)
  await db_session.commit()

  mock_arena = AsyncMock(
    side_effect=[
      [ArenaResponse("Model A", "m1", "```sql SELECT 1```", 10)],
      [ArenaResponse("Model B", "m2", "```sql SELECT 2```", 10)],
      [ArenaResponse("Model C", "m3", "```sql SELECT 3```", 10)],
    ]
  )

  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    assistant_msg = await chat_router._generate_assistant_reply(db_session, conv.id)

  assert assistant_msg is not None
  assert len(assistant_msg.candidates) == 3


@pytest.mark.asyncio
async def test_generate_assistant_reply_handles_exception(db_session, chat_user) -> None:
  """Exceptions during generation should return a fallback response."""
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  mock_arena = AsyncMock(side_effect=RuntimeError("boom"))
  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    assistant_msg = await chat_router._generate_assistant_reply(db_session, conv.id)

  assert assistant_msg is not None
  assert len(assistant_msg.candidates) == 1
  assert "unable to process" in assistant_msg.candidates[0].content.lower()


@pytest.mark.asyncio
async def test_create_conversation_defaults_title(client: AsyncClient, chat_user) -> None:
  """Missing title/message should default to 'New Chat'."""
  res = await client.post("/api/v1/conversations/", json={})
  assert res.status_code == 200
  data = res.json()
  assert data["title"] == "New Chat"
  assert data["messages"] == []


@pytest.mark.asyncio
async def test_update_conversation_not_found(client: AsyncClient, chat_user) -> None:
  res = await client.put(f"/api/v1/conversations/{uuid.uuid4()}", json={"title": "x"})
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_conversation_not_found(client: AsyncClient, chat_user) -> None:
  res = await client.delete(f"/api/v1/conversations/{uuid.uuid4()}")
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_messages_not_found(client: AsyncClient, chat_user) -> None:
  res = await client.get(f"/api/v1/conversations/{uuid.uuid4()}/messages")
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_messages_success(client: AsyncClient, chat_user, db_session) -> None:
  conv = Conversation(user_id=chat_user.id, title="Messages")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="assistant", content="Hello")
  db_session.add(msg)
  await db_session.commit()

  res = await client.get(f"/api/v1/conversations/{conv.id}/messages")
  assert res.status_code == 200
  data = res.json()
  assert len(data) == 1
  assert data[0]["content"] == "Hello"


@pytest.mark.asyncio
async def test_send_message_not_found(client: AsyncClient, chat_user) -> None:
  res = await client.post(f"/api/v1/conversations/{uuid.uuid4()}/messages", json={"content": "hi"})
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_send_message_success(client: AsyncClient, chat_user, db_session) -> None:
  """Sending a message should return an assistant reply."""
  conv = Conversation(user_id=chat_user.id, title="Chat")
  db_session.add(conv)
  await db_session.commit()

  with patch("app.api.routers.chat.llm_client.generate_arena_competition") as mock_arena:
    mock_arena.return_value = [
      ArenaResponse("Model A", "m1", "SQL A", 100),
      ArenaResponse("Model B", "m2", "SQL B", 120),
      ArenaResponse("Model C", "m3", "SQL C", 110),
    ]

    res = await client.post(f"/api/v1/conversations/{conv.id}/messages", json={"content": "hello"})

  assert res.status_code == 200
  data = res.json()
  assert data["role"] == "assistant"
  assert len(data["candidates"]) >= 3


@pytest.mark.asyncio
async def test_vote_candidate_not_found_cases(client: AsyncClient, chat_user, db_session) -> None:
  """Covers conversation, message, and candidate not found branches."""
  # Conversation not found
  res_missing_conv = await client.post(
    f"/api/v1/conversations/{uuid.uuid4()}/messages/{uuid.uuid4()}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_conv.status_code == 404

  # Message not found
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  res_missing_msg = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{uuid.uuid4()}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_msg.status_code == 404

  # Candidate not found
  msg = Message(conversation_id=conv.id, role="assistant", content="Pending")
  db_session.add(msg)
  await db_session.commit()
  await db_session.refresh(msg)

  res_missing_candidate = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{msg.id}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_candidate.status_code == 404
