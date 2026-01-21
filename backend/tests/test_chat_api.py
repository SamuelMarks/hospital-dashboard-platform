"""
Tests for Chat API Router.

Verifies the end-to-end flow of the messaging system including:
1. Creating conversations.
2. Sending messages.
3. Retrieving history.
4. Auto-titling logic.
5. SQL Extraction validation.

(Updates: Fixed route prefix matching and user fixture persistence)
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import Conversation

# Constants
# Matching the router prefix in main.py: /api/v1/conversations
CONVERSATIONS_URL = "/api/v1/conversations"


@pytest.fixture
async def mock_user_auth(db_session):
  """
  Dependency override fixture.
  Creates a PERSISTED user and overrides the `get_current_user` dependency.
  """
  user_id = uuid.uuid4()
  mock_user = User(id=user_id, email=f"chat_tester_{user_id}@test.com", hashed_password="x", is_active=True)
  db_session.add(mock_user)
  await db_session.commit()
  await db_session.refresh(mock_user)

  # IMPORTANT: The override must return a valid object that exists in the DB
  # because the router API will use it to create relationships (FKs).
  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: mock_user
  return mock_user


@pytest.mark.asyncio
async def test_create_conversation_empty(client: AsyncClient, mock_user_auth) -> None:
  """
  Test creating a conversation without an initial message.
  """
  # use follow_redirects=True to handle potential trailing slash issues seamlessly
  response = await client.post(f"{CONVERSATIONS_URL}/", json={}, follow_redirects=True)

  assert response.status_code == 200
  data = response.json()
  assert data["title"] == "New Chat"
  assert data["id"] is not None
  assert len(data.get("messages", [])) == 0


@pytest.mark.asyncio
async def test_create_conversation_with_message(client: AsyncClient, mock_user_auth) -> None:
  """
  Test creating a conversation WITH an initial message.
  """
  input_text = "Analyze the ICU Admission Rate"

  # Mock LLM Completion
  with patch("app.api.routers.chat.completion") as mock_llm:
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="Here is the analysis."))]
    mock_llm.return_value = mock_response

    response = await client.post(f"{CONVERSATIONS_URL}/", json={"message": input_text}, follow_redirects=True)

    assert response.status_code == 200
    data = response.json()

    assert data["title"] == input_text
    assert len(data["messages"]) == 2
    assert data["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_send_message_flow(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Test adding a message to an existing conversation.
  """
  # 1. Seed Conversation manually
  conv = Conversation(user_id=mock_user_auth.id, title="Ongoing Chat")
  db_session.add(conv)
  await db_session.commit()
  await db_session.refresh(conv)  # Get ID

  # 2. Send Message via API
  with patch("app.api.routers.chat.completion") as mock_llm:
    # Mock LLM returning SQL block
    llm_output = "Sure.\n```sql\nSELECT count(*) FROM table\n```"
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content=llm_output))]
    mock_llm.return_value = mock_response

    # Mock SQL Validator to allow it
    with patch("app.api.routers.chat.sqlglot.transpile"):
      url = f"{CONVERSATIONS_URL}/{conv.id}/messages"
      response = await client.post(url, json={"content": "Count records"}, follow_redirects=True)

      if response.status_code != 200:
        print(response.json())  # Debug help

      assert response.status_code == 200
      data = response.json()

      assert data["role"] == "assistant"
      assert data["sql_snippet"] == "SELECT count(*) FROM table"


@pytest.mark.asyncio
async def test_list_conversations_auth_scope(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Verify that listing conversations only returns those owned by the user.
  """
  # User's chat
  c1 = Conversation(user_id=mock_user_auth.id, title="My Chat")

  # Other's chat
  other_user = User(email=f"other_{uuid.uuid4()}@test.com", hashed_password="x")
  db_session.add(other_user)
  await db_session.commit()
  await db_session.refresh(other_user)

  c2 = Conversation(user_id=other_user.id, title="Secret Chat")

  db_session.add_all([c1, c2])
  await db_session.commit()

  response = await client.get(f"{CONVERSATIONS_URL}/", follow_redirects=True)
  assert response.status_code == 200
  data = response.json()

  assert len(data) == 1
  assert data[0]["title"] == "My Chat"


@pytest.mark.asyncio
async def test_get_history_not_found(client: AsyncClient, mock_user_auth) -> None:
  """
  Verify 404 when accessing non-existent conversation.
  """
  random_id = uuid.uuid4()
  response = await client.get(f"{CONVERSATIONS_URL}/{random_id}/messages", follow_redirects=True)
  assert response.status_code == 404


# Cleanup
from app.main import app

app.dependency_overrides = {}
