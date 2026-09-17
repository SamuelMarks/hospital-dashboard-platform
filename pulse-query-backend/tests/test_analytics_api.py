"""
Tests for Analytics API Router.
"""

import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User

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
  now = datetime.now(UTC)

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


@pytest.mark.asyncio
async def test_get_capacity_alerts_with_configured_rules(client: AsyncClient, analytics_user, db_session) -> None:
  """Test capacity alerts endpoint with custom AlertRules and DuckDB mock."""
  from unittest.mock import MagicMock, patch
  from app.models.alert_rule import AlertRule

  rule = AlertRule(
    unit_category="ICU",
    threshold_percentage=80.0,
    severity="CRITICAL",
    is_active=True,
  )
  db_session.add(rule)
  await db_session.commit()

  mock_cursor = MagicMock()
  mock_cursor.fetchall.return_value = [
    ("ICU", 18, 20),  # 90% >= 80% -> alert triggered
    ("General", 30, 100),  # 30% < 95% -> no alert
  ]
  mock_conn = MagicMock()
  mock_conn.cursor.return_value = mock_cursor

  with patch("app.api.routers.analytics.duckdb_manager.get_readonly_connection", return_value=mock_conn):
    res = await client.get("/api/v1/analytics/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) == 1
    assert alerts[0]["unit_category"] == "ICU"
    assert alerts[0]["occupancy_percentage"] == 90.0
    assert alerts[0]["severity"] == "CRITICAL"


@pytest.mark.asyncio
async def test_get_capacity_alerts_fallback_and_duckdb_exception(client: AsyncClient, analytics_user) -> None:
  """Test capacity alerts fallback rules and graceful exception handling when DuckDB is inaccessible."""
  from unittest.mock import patch

  with patch("app.api.routers.analytics.duckdb_manager.get_readonly_connection", side_effect=Exception("DB Down")):
    res = await client.get("/api/v1/analytics/alerts")
    assert res.status_code == 200
    assert res.json() == []
