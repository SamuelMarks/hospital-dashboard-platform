"""
Tests for Real-Time LLM Token Streaming via Server-Sent Events (SSE).

Verifies the streaming lifecycle across both `/api/v1/chat/stream/{conversation_id}`
and `/api/v1/conversations/stream/{conversation_id}` endpoints.
"""

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.api.deps import get_current_user
from app.models.chat import Conversation, Message
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse
from app.services.llm_client import ArenaResponse, LLMArenaClient, llm_client


@pytest.fixture
async def mock_user_auth(db_session):
  """
  Creates a persisted user and overrides the current_user dependency.
  """
  user_id = uuid.uuid4()
  user = User(id=user_id, email=f"stream_user_{user_id}@test.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: user
  try:
    yield user
  finally:
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_llm_client_stream_tokens_mock() -> None:
  """
  Verifies that stream_tokens generates tokens incrementally using mock logic.
  """
  client_instance = LLMArenaClient()
  client_instance.swarm = [
    {
      "client": None,
      "name": "System Mock",
      "id": "mock/fallback",
      "model_name": "mock-model",
      "provider": "mock",
      "is_local": True,
    }
  ]
  messages = [{"role": "user", "content": "How many patients in ICU?"}]
  tokens = []
  async for token in client_instance.stream_tokens(messages=messages, model_id="mock/fallback"):
    tokens.append(token)

  assert len(tokens) > 0
  full_output = "".join(tokens)
  assert "SELECT" in full_output
  assert "synthetic_hospital_data" in full_output


@pytest.mark.asyncio
async def test_llm_client_stream_tokens_empty_swarm() -> None:
  """
  Verifies safe fallback when swarm is completely empty.
  """
  empty_client = LLMArenaClient()
  empty_client.swarm = []
  tokens = []
  async for token in empty_client.stream_tokens(messages=[]):
    tokens.append(token)

  assert len(tokens) == 1
  assert "No LLM providers" in tokens[0]


@pytest.mark.asyncio
async def test_llm_client_stream_tokens_client_stream_and_fallback() -> None:
  """
  Verifies real client stream iteration and error fallback branches.
  """
  mock_client = MagicMock()

  # 1. Test chunk streaming with delta
  chunk1 = MagicMock(spec=["choices"])
  choice1 = MagicMock()
  choice1.delta = MagicMock(content="SELECT ")
  choice1.text = None
  chunk1.choices = [choice1]

  chunk2 = MagicMock(spec=["choices"])
  choice2 = MagicMock()
  choice2.delta = MagicMock(content="1;")
  choice2.text = None
  chunk2.choices = [choice2]

  # Chunk without choices and chunk with empty choices
  chunk_empty = MagicMock(spec=["choices"])
  chunk_empty.choices = []
  chunk_no_choices = MagicMock(spec=[])
  chunk_none = MagicMock(spec=["choices"])
  choice_none = MagicMock()
  choice_none.delta = MagicMock(content=None)
  choice_none.text = None
  chunk_none.choices = [choice_none]

  mock_client.completion.return_value = [chunk1, chunk_empty, chunk_no_choices, chunk_none, chunk2]

  admin_settings_match = AdminSettingsResponse(
    api_keys={"mock": "secret-key"},
    visible_models=["test/mock"],
  )
  admin_settings_unmatched = AdminSettingsResponse(
    api_keys={"other_provider": "secret-key"},
    visible_models=["test/mock"],
  )

  client_instance = LLMArenaClient()
  client_instance.swarm = [
    {
      "client": mock_client,
      "name": "Mock Test Provider",
      "id": "test/mock",
      "model_name": "test-model",
      "provider": "mock",
      "is_local": True,
    }
  ]

  # Run with matching admin settings
  tokens = []
  async for token in client_instance.stream_tokens(messages=[], admin_settings=admin_settings_match):
    tokens.append(token)
  assert tokens == ["SELECT ", "1;"]

  # Run with unmatched admin settings
  tokens_unmatched = []
  async for token in client_instance.stream_tokens(messages=[], admin_settings=admin_settings_unmatched):
    tokens_unmatched.append(token)
  assert tokens_unmatched == ["SELECT ", "1;"]

  # 2. Test text-based chunk
  text_chunk = MagicMock(spec=["choices"])
  choice_txt = MagicMock()
  choice_txt.delta = None
  choice_txt.text = "COUNT(*) "
  text_chunk.choices = [choice_txt]
  mock_client.completion.return_value = [text_chunk]

  text_tokens = []
  async for token in client_instance.stream_tokens(messages=[]):
    text_tokens.append(token)
  assert text_tokens == ["COUNT(*) "]

  # 2b. Test async iterable stream (__aiter__)
  async def async_chunk_generator():
    yield chunk1
    yield chunk_empty
    yield chunk2

  mock_client.completion.return_value = async_chunk_generator()
  async_tokens = []
  async for token in client_instance.stream_tokens(messages=[]):
    async_tokens.append(token)
  assert async_tokens == ["SELECT ", "1;"]

  # 2c. Test generator raising exception during stream pump
  def faulty_generator():
    yield chunk1
    raise RuntimeError("Pump generator crashed")

  mock_client.completion.return_value = faulty_generator()
  with patch.object(client_instance, "_generate_single") as mock_single:
    mock_single.return_value = ArenaResponse(
      provider_name="Mock", model_identifier="test/mock", content="SELECT recovered;", latency_ms=5, error=None
    )
    pump_tokens = []
    async for token in client_instance.stream_tokens(messages=[]):
      pump_tokens.append(token)
    assert "SELECT " in pump_tokens[0]
    assert "recovered;" in "".join(pump_tokens)

  # 3. Test non-streaming response object (hasattr 'choices')
  single_response = MagicMock()
  single_response.choices = [MagicMock(message=MagicMock(content="SELECT 42;"))]
  mock_client.completion.return_value = single_response

  single_tokens = []
  async for token in client_instance.stream_tokens(messages=[]):
    single_tokens.append(token)
  assert "".join(single_tokens).strip() == "SELECT 42;"

  # 4. Test fallback with res.error
  mock_client.completion.side_effect = RuntimeError("Streaming error")
  with patch.object(client_instance, "_generate_single") as mock_single:
    mock_single.return_value = ArenaResponse(
      provider_name="Mock", model_identifier="test/mock", content="", latency_ms=10, error="Critical fail"
    )

    error_tokens = []
    async for token in client_instance.stream_tokens(messages=[]):
      error_tokens.append(token)
    assert len(error_tokens) >= 2
    assert "System Fallback" in "".join(error_tokens)

  # 5. Test fallback without res.error (standard generation success)
  with patch.object(client_instance, "_generate_single") as mock_single:
    mock_single.return_value = ArenaResponse(
      provider_name="Mock", model_identifier="test/mock", content="SELECT fallback_success;", latency_ms=10, error=None
    )

    success_tokens = []
    async for token in client_instance.stream_tokens(messages=[]):
      success_tokens.append(token)
    assert "fallback_success" in "".join(success_tokens)


@pytest.mark.asyncio
async def test_chat_sse_stream_endpoint_success(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Verifies full Server-Sent Events stream lifecycle for a conversation.
  """
  conv = Conversation(id=uuid.uuid4(), user_id=mock_user_auth.id, title="Test Streaming Chat")
  db_session.add(conv)
  await db_session.flush()

  user_msg = Message(
    conversation_id=conv.id,
    role="user",
    content="Show daily admissions count",
  )
  db_session.add(user_msg)
  other_msg = Message(
    conversation_id=conv.id,
    role="system",
    content="System prompt context",
  )
  db_session.add(other_msg)
  await db_session.commit()

  # Connect to SSE streaming endpoint
  response = await client.get(f"/api/v1/chat/stream/{conv.id}")
  assert response.status_code == 200
  assert "text/event-stream" in response.headers["content-type"]

  # Read SSE events
  events = []
  for line in response.text.splitlines():
    line = line.strip()
    if line.startswith("data:"):
      data_json = line[len("data:") :].strip()
      events.append(json.loads(data_json))

  assert len(events) >= 3
  # Event 0 must be 'start'
  assert events[0]["event"] == "start"
  assert events[0]["conversation_id"] == str(conv.id)

  # Intermediate events must be 'token'
  token_events = [e for e in events if e["event"] == "token"]
  assert len(token_events) > 0

  # Final event must be 'done'
  done_event = events[-1]
  assert done_event["event"] == "done"
  assert "message_id" in done_event
  assert "SELECT" in done_event["content"]

  # Verify assistant message was saved to the database
  db_session.expire_all()
  stmt = select(Message).where(Message.id == uuid.UUID(done_event["message_id"]))
  res = await db_session.execute(stmt)
  saved_msg = res.scalars().first()
  assert saved_msg is not None
  assert saved_msg.role == "assistant"
  assert saved_msg.content == done_event["content"]


@pytest.mark.asyncio
async def test_chat_sse_stream_endpoint_conversations_alias(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Verifies that the `/api/v1/conversations/stream/{id}` alias operates equivalently.
  """
  conv = Conversation(id=uuid.uuid4(), user_id=mock_user_auth.id, title="Alias Streaming Chat")
  db_session.add(conv)
  await db_session.commit()

  response = await client.get(f"/api/v1/conversations/stream/{conv.id}")
  assert response.status_code == 200
  assert "text/event-stream" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_chat_sse_stream_not_found(client: AsyncClient, mock_user_auth) -> None:
  """
  Verifies 404 response when streaming for a non-existent conversation.
  """
  random_id = uuid.uuid4()
  response = await client.get(f"/api/v1/chat/stream/{random_id}")
  assert response.status_code == 404
  assert response.json()["detail"] == "Conversation not found"
