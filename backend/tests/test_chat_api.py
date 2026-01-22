"""
Tests for Chat API Router.

Verifies the end-to-end flow of the messaging system including:
1. Creating conversations.
2. Sending messages with Candidate generation.
3. Voting flow.
4. Renaming and Deleting conversations.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import Conversation, MessageCandidate, Message
from app.services.llm_client import ArenaResponse

# Constants
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

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: mock_user
  return mock_user


@pytest.mark.asyncio
async def test_create_conversation_candidates_flow(client: AsyncClient, mock_user_auth) -> None:
  """
  Test that creating a conversation triggers generation of 3 candidates.
  """
  input_text = "Analyze ICU"

  with patch("app.api.routers.chat.llm_client.generate_arena_competition") as mock_arena:
    # Mock returning 3 disparate responses
    mock_arena.return_value = [
      ArenaResponse("Model A", "m1", "SQL A", 100),
      ArenaResponse("Model B", "m2", "SQL B", 120),
      ArenaResponse("Model C", "m3", "SQL C", 110),
    ]

    response = await client.post(f"{CONVERSATIONS_URL}/", json={"message": input_text}, follow_redirects=True)

    assert response.status_code == 200
    data = response.json()

    # Message 0 = User, Message 1 = Assistant
    assistant_msg = data["messages"][1]
    assert len(assistant_msg["candidates"]) >= 3
    assert assistant_msg["candidates"][0]["content"] == "SQL A"


@pytest.mark.asyncio
async def test_vote_candidate_flow(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Test that voting selects a candidate and promotes its content.
  """
  # 1. Setup Data
  conv = Conversation(user_id=mock_user_auth.id, title="Vote Chat")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="assistant", content="Pending Vote", sql_snippet=None)
  db_session.add(msg)
  await db_session.commit()

  cand = MessageCandidate(
    message_id=msg.id, model_name="Winner", content="Winning Content", sql_snippet="SELECT WIN", is_selected=False
  )
  db_session.add(cand)
  await db_session.commit()
  await db_session.refresh(cand)

  # 2. Vote
  vote_url = f"{CONVERSATIONS_URL}/{conv.id}/messages/{msg.id}/vote"
  response = await client.post(vote_url, json={"candidate_id": str(cand.id)})

  assert response.status_code == 200
  data = response.json()

  # 3. Verify Promotion
  assert data["content"] == "Winning Content"
  assert data["sql_snippet"] == "SELECT WIN"

  target = next(c for c in data["candidates"] if c["id"] == str(cand.id))
  assert target["is_selected"] is True


@pytest.mark.asyncio
async def test_rename_and_delete_conversation(client: AsyncClient, mock_user_auth, db_session) -> None:
  """
  Test renaming and deleting a conversation.
  """
  conv = Conversation(user_id=mock_user_auth.id, title="Original Title")
  db_session.add(conv)
  await db_session.commit()

  # Rename
  res_put = await client.put(f"{CONVERSATIONS_URL}/{conv.id}", json={"title": "New Title"})
  assert res_put.status_code == 200
  assert res_put.json()["title"] == "New Title"

  # Delete
  res_del = await client.delete(f"{CONVERSATIONS_URL}/{conv.id}")
  assert res_del.status_code == 204

  # Verify Gone
  res_list = await client.get(f"{CONVERSATIONS_URL}/")
  assert len(res_list.json()) == 0


from app.main import app

app.dependency_overrides = {}
