"""
Additional tests for chat router edge cases and voting ownership/parentage security.
"""

from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routers import chat as chat_router
from app.core.security import create_access_token
from app.main import app
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.user import User
from app.services.llm_client import ArenaResponse


@pytest.fixture
async def chat_user(db_session: AsyncSession) -> AsyncGenerator[User, None]:
  """
  Creates a test user and overrides `get_current_user` for the duration of the test.

  Args:
      db_session (Any): Active test database session.

  Yields:
      User: Created test user instance.
  """
  user = User(email=f"edge_{uuid.uuid4()}@example.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  app.dependency_overrides[get_current_user] = lambda: user
  yield user
  app.dependency_overrides = {}


def test_extract_and_validate_sql_empty_block() -> None:
  """Empty SQL blocks should return None."""
  assert (
    chat_router._extract_and_validate_sql("""```sql

```""")
    is None
  )


def test_extract_and_validate_sql_invalid_sql() -> None:
  """Invalid SQL should return None."""
  assert (
    chat_router._extract_and_validate_sql("""```sql
SELEC * FROM t
```""")
    is None
  )


def test_extract_and_validate_sql_no_match() -> None:
  """Text without sql blocks should return None."""
  assert chat_router._extract_and_validate_sql("Just plain text with no code blocks.") is None


def test_extract_and_validate_sql_empty_string() -> None:
  """Empty string should return None."""
  assert chat_router._extract_and_validate_sql("") is None
  assert chat_router._extract_and_validate_sql(None) is None


def test_extract_and_validate_sql_with_json_and_sql_blocks() -> None:
  """Text with both JSON and SQL blocks should accurately extract the SQL block."""
  mixed_text = """
Here is the schema configuration:
```json
{
  "target": "synthetic_hospital_data"
}
```
And here is your analytical SQL query:
```sql
SELECT Clinical_Service, count(*) FROM synthetic_hospital_data GROUP BY 1;
```
Hope this helps!
"""
  sql = chat_router._extract_and_validate_sql(mixed_text)
  assert sql is not None
  assert "SELECT Clinical_Service" in sql
  assert "json" not in sql.lower()


def test_extract_and_validate_sql_generic_block() -> None:
  """Untagged code blocks that parse as valid SQL should be extracted."""
  text = """
Here is the query:
```
SELECT 1 AS test_val
```
"""
  sql = chat_router._extract_and_validate_sql(text)
  assert sql is not None
  assert "SELECT 1" in sql


def test_extract_and_validate_sql_whitespace_blocks() -> None:
  """Whitespace-only code blocks should be skipped safely."""
  assert (
    chat_router._extract_and_validate_sql("""```sql

 ```""")
    is None
  )
  assert (
    chat_router._extract_and_validate_sql("""```

 ```""")
    is None
  )


def test_extract_and_validate_sql_column_only_blocks() -> None:
  """Blocks with only bare column identifiers should not be returned."""
  assert (
    chat_router._extract_and_validate_sql("""```sql
just_a_col
```""")
    is None
  )
  assert (
    chat_router._extract_and_validate_sql("""```
just_a_col
```""")
    is None
  )


@pytest.mark.asyncio
async def test_generate_assistant_reply_with_target_models(db_session: AsyncSession, chat_user: User) -> None:
  """Tests behavior when specific target models are provided."""
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  mock_arena = AsyncMock(return_value=[ArenaResponse("M1", "m1", "SELECT 1", 10, None)])
  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    msg = await chat_router._generate_assistant_reply(db_session, conv.id, target_models=["m1"])

  assert len(msg.candidates) >= 1


@pytest.mark.asyncio
async def test_generate_assistant_reply_empty_response(db_session: AsyncSession, chat_user: User) -> None:
  """Tests behavior when ZERO models respond within the Arena."""
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  mock_arena = AsyncMock(return_value=[])
  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    msg = await chat_router._generate_assistant_reply(db_session, conv.id)
    assert len(msg.candidates) == 1
    assert "All providers failed" in msg.candidates[0].content or "no models responded" in msg.candidates[0].content


@pytest.mark.asyncio
async def test_generate_assistant_reply_empty_content(db_session: AsyncSession, chat_user: User) -> None:
  """Tests fallback when an LLM successfully responds but leaves content empty string."""
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  mock_arena = AsyncMock(return_value=[ArenaResponse("M1", "m1", "", 10, None)])
  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    msg = await chat_router._generate_assistant_reply(db_session, conv.id)
    assert len(msg.candidates) >= 1
    assert "(Empty Response)" in [c.content for c in msg.candidates]


@pytest.mark.asyncio
async def test_generate_assistant_reply_expands_candidates(db_session: AsyncSession, chat_user: User) -> None:
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
async def test_generate_assistant_reply_handles_exception(db_session: AsyncSession, chat_user: User) -> None:
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
async def test_generate_assistant_reply_dedupes_model_names(db_session: AsyncSession, chat_user: User) -> None:
  """Duplicate provider names should be made unique."""
  conv = Conversation(user_id=chat_user.id, title="Dupes")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="user", content="Hi")
  db_session.add(msg)
  await db_session.commit()

  mock_arena = AsyncMock(
    return_value=[
      ArenaResponse("Model A", "m1", "```sql SELECT 1```", 10),
      ArenaResponse("Model A", "m2", "```sql SELECT 2```", 10),
      ArenaResponse("Model A", "m3", "```sql SELECT 3```", 10),
    ]
  )

  with (
    patch("app.api.routers.chat.llm_client.generate_arena_competition", mock_arena),
    patch("app.api.routers.chat.schema_service.get_schema_context_string", return_value="schema"),
  ):
    assistant_msg = await chat_router._generate_assistant_reply(db_session, conv.id)

  names = [c.model_name for c in assistant_msg.candidates]
  assert "Model A" in names
  assert "Model A 2" in names
  assert "Model A 3" in names


@pytest.mark.asyncio
async def test_create_conversation_defaults_title(client: AsyncClient, chat_user: User) -> None:
  """Missing title/message should default to 'New Chat'."""
  _ = chat_user
  res = await client.post("/api/v1/conversations/", json={})
  assert res.status_code == 200
  data = res.json()
  assert data["title"] == "New Chat"
  assert data["messages"] == []


@pytest.mark.asyncio
async def test_update_conversation_not_found(client: AsyncClient, chat_user: User) -> None:
  """Verifies updating a non-existent conversation returns 404."""
  _ = chat_user
  res = await client.put(f"/api/v1/conversations/{uuid.uuid4()}", json={"title": "x"})
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_conversation_not_found(client: AsyncClient, chat_user: User) -> None:
  """Verifies deleting a non-existent conversation returns 404."""
  _ = chat_user
  res = await client.delete(f"/api/v1/conversations/{uuid.uuid4()}")
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_messages_not_found(client: AsyncClient, chat_user: User) -> None:
  """Verifies fetching messages for a non-existent conversation returns 404."""
  _ = chat_user
  res = await client.get(f"/api/v1/conversations/{uuid.uuid4()}/messages")
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_messages_success(client: AsyncClient, chat_user: User, db_session: AsyncSession) -> None:
  """Verifies fetching messages for an owned conversation returns ordered messages."""
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
async def test_send_message_not_found(client: AsyncClient, chat_user: User) -> None:
  """Verifies sending a message to a non-existent conversation returns 404."""
  _ = chat_user
  res = await client.post(f"/api/v1/conversations/{uuid.uuid4()}/messages", json={"content": "hi"})
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_vote_candidate_marks_same_sql_hash(client: AsyncClient, chat_user: User, db_session: AsyncSession) -> None:
  """Voting should mark all candidates sharing the same sql_hash."""
  conv = Conversation(user_id=chat_user.id, title="Shared Hash")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="assistant", content="Pending Vote", sql_snippet=None)
  db_session.add(msg)
  await db_session.commit()

  c1 = MessageCandidate(
    message_id=msg.id,
    model_name="A",
    content="A",
    sql_snippet="SELECT 1",
    sql_hash="same-hash",
    is_selected=False,
  )
  c2 = MessageCandidate(
    message_id=msg.id,
    model_name="B",
    content="B",
    sql_snippet="SELECT 1",
    sql_hash="same-hash",
    is_selected=False,
  )
  db_session.add_all([c1, c2])
  await db_session.commit()

  vote_url = f"/api/v1/conversations/{conv.id}/messages/{msg.id}/vote"
  response = await client.post(vote_url, json={"candidate_id": str(c1.id)})

  assert response.status_code == 200
  data = response.json()
  selected = [c for c in data["candidates"] if c["is_selected"]]
  assert len(selected) == 2


@pytest.mark.asyncio
async def test_vote_candidate_no_sql_hash(client: AsyncClient, chat_user: User, db_session: AsyncSession) -> None:
  """Covers the branch when a candidate is missing sql_hash and strictly uses fallback ID."""
  conv = Conversation(user_id=chat_user.id, title="No Hash")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="assistant", content="Pending Vote", sql_snippet=None)
  db_session.add(msg)
  await db_session.commit()

  c1 = MessageCandidate(
    message_id=msg.id,
    model_name="A",
    content="A",
    sql_snippet=None,
    sql_hash=None,
    is_selected=False,
  )
  db_session.add(c1)
  await db_session.commit()

  vote_url = f"/api/v1/conversations/{conv.id}/messages/{msg.id}/vote"
  response = await client.post(vote_url, json={"candidate_id": str(c1.id)})

  assert response.status_code == 200
  data = response.json()
  assert data["candidates"][0]["is_selected"] is True


@pytest.mark.asyncio
async def test_vote_candidate_rejects_cross_message_and_user_role_tampering(
  client: AsyncClient, chat_user: User, db_session: AsyncSession
) -> None:
  """Verifies voting on a candidate from another message or on a user-role message returns 404 without mutating state."""
  conv = Conversation(user_id=chat_user.id, title="Security Check")
  db_session.add(conv)
  await db_session.flush()

  user_msg = Message(conversation_id=conv.id, role="user", content="Original User Question")
  msg1 = Message(conversation_id=conv.id, role="assistant", content="Original Assistant 1")
  msg2 = Message(conversation_id=conv.id, role="assistant", content="Original Assistant 2")
  db_session.add_all([user_msg, msg1, msg2])
  await db_session.flush()

  cand_msg2 = MessageCandidate(
    message_id=msg2.id,
    model_name="M2",
    content="Foreign Candidate Content",
    sql_snippet="SELECT 999",
    is_selected=False,
  )
  db_session.add(cand_msg2)
  await db_session.commit()

  # Attempt to vote on msg1 using cand_msg2 (belongs to msg2) -> must return 404
  res_cross = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{msg1.id}/vote",
    json={"candidate_id": str(cand_msg2.id)},
  )
  assert res_cross.status_code == 404

  await db_session.refresh(msg1)
  assert msg1.content == "Original Assistant 1"

  # Attempt to vote on user_msg (role == 'user') -> must return 404
  res_user_role = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{user_msg.id}/vote",
    json={"candidate_id": str(cand_msg2.id)},
  )
  assert res_user_role.status_code == 404


@pytest.mark.asyncio
async def test_send_message_success(client: AsyncClient, chat_user: User, db_session: AsyncSession) -> None:
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
async def test_vote_candidate_not_found_cases(client: AsyncClient, chat_user: User, db_session: AsyncSession) -> None:
  """Covers conversation, message, and candidate not found branches."""
  res_missing_conv = await client.post(
    f"/api/v1/conversations/{uuid.uuid4()}/messages/{uuid.uuid4()}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_conv.status_code == 404

  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  res_missing_msg = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{uuid.uuid4()}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_msg.status_code == 404

  msg = Message(conversation_id=conv.id, role="assistant", content="Pending")
  db_session.add(msg)
  await db_session.commit()
  await db_session.refresh(msg)

  res_missing_candidate = await client.post(
    f"/api/v1/conversations/{conv.id}/messages/{msg.id}/vote", json={"candidate_id": str(uuid.uuid4())}
  )
  assert res_missing_candidate.status_code == 404


@pytest.mark.asyncio
async def test_chat_conversation_creation_title_variants(
  client: AsyncClient, chat_user: User, db_session: AsyncSession
) -> None:
  """Verifies conversation title derivation across empty, short, long, and explicit title payloads."""
  headers = {"Authorization": f"Bearer {create_access_token(chat_user.id)}"}
  conv = Conversation(user_id=chat_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  msg_sys = Message(conversation_id=conv.id, role="system", content="sys")
  msg_usr = Message(conversation_id=conv.id, role="user", content="usr")
  db_session.add_all([msg_sys, msg_usr])
  await db_session.commit()

  res_list: list[list[ArenaResponse]] = [[ArenaResponse("m1", "m1-v", "SEL 1", 100, None)], []]

  def se(*_args: object, **_kwargs: object) -> list[ArenaResponse]:
    """
    Side-effect helper popping canned `ArenaResponse` lists for sequential calls.

    Args:
        *_args (object): Ignored positional arguments.
        **_kwargs (object): Ignored keyword arguments.

    Returns:
        list[ArenaResponse]: Next canned response list or empty list.
    """
    if res_list:
      return res_list.pop(0)
    return []

  with patch("app.api.routers.chat.llm_client.generate_arena_competition", side_effect=se):
    r0 = await client.post("/api/v1/chat/", json={"message": "Hi", "conversation_id": str(conv.id)}, headers=headers)
    assert r0.status_code == 200

    r1 = await client.post("/api/v1/conversations/", json={"title": "", "message": "First message"}, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["title"] == "First message"

    r2 = await client.post(
      "/api/v1/conversations/",
      json={
        "title": "",
        "message": "This is a long message that exceeds forty characters in length to test truncation.",
      },
      headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["title"].endswith("...")

    r3 = await client.post(
      "/api/v1/conversations/", json={"title": "Custom Title", "message": "Custom Message"}, headers=headers
    )
    assert r3.status_code == 200
    assert r3.json()["title"] == "Custom Title"

    r4 = await client.post("/api/v1/conversations/", json={"title": "Empty", "message": ""}, headers=headers)
    assert r4.status_code == 200
    assert r4.json()["title"] == "Empty"
