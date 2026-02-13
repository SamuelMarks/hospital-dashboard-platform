"""
Tests for Analytics API Router.
"""

from datetime import datetime, timedelta, timezone
import uuid
import pytest

from httpx import AsyncClient

from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog, ModelCandidate


ANALYTICS_URL = "/api/v1/analytics/llm"


@pytest.fixture
async def analytics_user(db_session):
  """Create a user and override auth dependency."""
  user = User(email=f"analytics_{uuid.uuid4()}@example.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  from app.main import app

  app.dependency_overrides[get_current_user] = lambda: user
  yield user
  app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_analytics_llm_combines_chat_and_ai(client: AsyncClient, analytics_user, db_session) -> None:
  """Ensure analytics endpoint returns chat and AI experiment rows."""
  now = datetime.now(timezone.utc)

  # Chat arena data
  conv = Conversation(user_id=analytics_user.id, title="Chat Arena")
  db_session.add(conv)
  await db_session.commit()

  user_msg = Message(
    conversation_id=conv.id,
    role="user",
    content="How many beds?",
    created_at=now - timedelta(minutes=2),
  )
  assistant_msg = Message(
    conversation_id=conv.id,
    role="assistant",
    content="Multiple options generated.",
    created_at=now - timedelta(minutes=1),
  )
  db_session.add_all([user_msg, assistant_msg])
  await db_session.commit()

  chat_candidate = MessageCandidate(
    message_id=assistant_msg.id,
    model_name="GPT-4o",
    content="```sql SELECT 1```",
    sql_snippet="SELECT 1",
    sql_hash="hash-chat",
    is_selected=True,
  )
  db_session.add(chat_candidate)
  await db_session.commit()

  # AI experiment data
  experiment = ExperimentLog(
    user_id=analytics_user.id,
    prompt_text="AI prompt",
    prompt_strategy="zero-shot",
    created_at=now,
  )
  db_session.add(experiment)
  await db_session.commit()

  ai_candidate = ModelCandidate(
    experiment_id=experiment.id,
    model_identifier="openai/gpt-4o",
    model_tag="GPT-4o",
    generated_sql="SELECT 2",
    sql_hash="hash-ai",
    is_selected=False,
  )
  db_session.add(ai_candidate)
  await db_session.commit()

  res = await client.get(ANALYTICS_URL)
  assert res.status_code == 200
  data = res.json()

  sources = {row["source"] for row in data}
  assert "chat" in sources
  assert "ai" in sources

  chat_row = next(r for r in data if r["source"] == "chat")
  assert chat_row["query_text"] == "How many beds?"
  assert chat_row["conversation_title"] == "Chat Arena"
  assert chat_row["sql_snippet"] == "SELECT 1"

  ai_row = next(r for r in data if r["source"] == "ai")
  assert ai_row["prompt_strategy"] == "zero-shot"
  assert ai_row["query_text"] == "AI prompt"
  assert ai_row["sql_snippet"] == "SELECT 2"
